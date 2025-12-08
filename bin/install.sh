#!/bin/bash
# trojan-go一键安装脚本 (最终优化版)
# 1. 恢复宝塔(BT)判断和 Nginx 配置路径。
# 2. 恢复从 /opt/trojan-go-cmd/bin/${IP}.json 文件读取配置。
# 3. 恢复 configTrojan 包含所有配置项的完整结构。
# 4. 修复 apt 警告 (使用 apt-get)。
# 5. 优化 Nginx 启用，消除 SystemV 警告。
# 6. configNginx 改为使用静态文件（仅监听 127.0.0.1:80）。

RED="\033[31m"      # Error message
GREEN="\033[32m"    # Success message
YELLOW="\033[33m"   # Warning message
BLUE="\033[36m"     # Info message
PLAIN='\033[0m'

V6_PROXY=""
IP=$(curl -sL -4 ip.sb || curl -sL -6 ip.sb)
if [[ "$?" != "0" ]]; then
    V6_PROXY="https://gh.hijk.art/"
fi

# ==================== 恢复 BT 判断逻辑 ====================
BT="false"
NGINX_CONF_PATH="/etc/nginx/conf.d/"
res=$(which bt 2>/dev/null)
if [[ "$res" != "" ]]; then
    BT="true"
    NGINX_CONF_PATH="/www/server/panel/vhost/nginx/"
fi
# ==========================================================

ZIP_FILE="trojan-go"
CONFIG_FILE="/etc/trojan-go/config.json"
CONFIG_JSON="/opt/trojan-go-cmd/bin/${IP}.json"

colorEcho() {
    echo -e "${1}${@:2}${PLAIN}"
}

checkSystem() {
    if [[ $EUID -ne 0 ]]; then
        colorEcho $RED " 错误：必须使用 root 用户运行此脚本！"
        exit 1
    fi

    if command -v yum >/dev/null 2>&1; then
        PMT="yum"
        CMD_INSTALL="yum install -y "
        CMD_REMOVE="yum remove -y "
        CMD_UPGRADE="yum update -y"
    elif command -v apt-get >/dev/null 2>&1; then # 使用 apt-get 消除警告
        PMT="apt-get"
        CMD_INSTALL="apt-get install -y "
        CMD_REMOVE="apt-get remove -y "
        CMD_UPGRADE="apt-get update; apt-get upgrade -y; apt-get autoremove -y"
    else
        colorEcho $RED " 不支持的系统，仅支持 CentOS/Debian/Ubuntu"
        exit 1
    fi
    
    if ! command -v systemctl >/dev/null 2>&1; then
        colorEcho $RED " 系统版本过低，请升级到最新版本"
        exit 1
    fi
}

# 恢复 getData 函数：从预设路径读取配置
getData() {
    if [[ ! -f $CONFIG_JSON ]]; then
        colorEcho $RED " 错误: 配置文件 $CONFIG_JSON 不存在或无法读取！"
        colorEcho $RED " 请确保该文件存在并包含正确的配置信息 (DOMAIN, PORT, PASSWORD, WS, WSPATH)！"
        exit 1
    fi

    DOMAIN=$(grep sni $CONFIG_JSON | cut -d\" -f4)
    PORT=$(grep local_port $CONFIG_JSON | cut -d: -f2 | tr -d \",' ')
    
    # 提取密码（假设密码是数组的第一个元素）
    line1=$(grep -n 'password' $CONFIG_JSON  | head -n1 | cut -d: -f1)
    line11=$((line1 + 1))
    PASSWORD=$(sed -n "${line11}p" $CONFIG_JSON | tr -d \"' ' | sed 's/,$//')
    
    # 提取 WebSocket 配置
    WS=$(grep websocket $CONFIG_JSON | cut -d: -f2 | tr -d \",' ' | sed 's/,$//')
    if [[ "$WS" = "true" ]]; then
        WSPATH=$(grep path $CONFIG_JSON | cut -d: -f2 | tr -d \",' ' | sed 's/,$//')
    else
        WSPATH=""
    fi
    
    if [[ -z "$DOMAIN" || -z "$PORT" || -z "$PASSWORD" ]]; then
        colorEcho $RED " 错误: 配置文件 $CONFIG_JSON 缺少 DOMAIN, PORT 或 PASSWORD 字段！"
        exit 1
    fi

    colorEcho $BLUE " 成功从 $CONFIG_JSON 读取配置信息..."
    echo -e "   域名：${DOMAIN}"
    echo -e "   端口：${PORT}"
    echo -e "   密码：${PASSWORD}"
    if [[ "$WS" = "true" ]]; then
        echo -e "   WS路径：${WSPATH}"
    fi
}

archAffix() {
    case "$(uname -m)" in
        i686|i386) echo '386' ;;
        x86_64|amd64) echo 'amd64' ;;
        *armv7*|armv6l) echo 'armv7' ;;
        *armv8*|aarch64) echo 'armv8' ;;
        *) return 1 ;;
    esac
}

installNginx() {
    colorEcho $BLUE " 正在安装 Nginx..."
    
    if [[ "$BT" = "false" ]]; then
        if [[ "$PMT" = "yum" ]]; then
            $CMD_INSTALL epel-release
        fi
        $CMD_INSTALL nginx
        # 优化启动逻辑，避免 SysV 警告
        systemctl enable nginx
    else
        res=$(which nginx 2>/dev/null)
        if [[ "$?" != "0" ]]; then
            colorEcho $RED " 您安装了宝塔，请在宝塔后台安装nginx后再运行本脚本"
            exit 1
        fi
    fi
}

startNginx() {
    if [[ "$BT" = "false" ]]; then
        systemctl start nginx
    else
        /etc/init.d/nginx start
    fi
}

stopNginx() {
    if [[ "$BT" = "false" ]]; then
        systemctl stop nginx
    else
        /etc/init.d/nginx stop
    fi
}

getCert() {
    mkdir -p /etc/trojan-go
    
    stopNginx
    systemctl stop trojan-go
    sleep 2
    
    res=$(ss -ntlp| grep -E ':80 |:443 ')
    if [[ "${res}" != "" ]]; then
        colorEcho $RED " 其他进程占用了80或443端口，请先关闭再运行一键脚本"
        echo " 端口占用信息如下："
        echo ${res}
        exit 1
    fi

    $CMD_INSTALL socat curl cron openssl
    
    # 安装 acme.sh
    curl -sL https://get.acme.sh | sh -s email=byron.zhuwenbo@gmail.com
    source ~/.bashrc
    ~/.acme.sh/acme.sh --upgrade --auto-upgrade
    ~/.acme.sh/acme.sh --set-default-ca --server letsencrypt

    # 申请证书
    colorEcho $YELLOW " 正在申请证书，请等待..."
    if [[ "$BT" = "false" ]]; then
        # 注意: 这里使用 pre-hook 和 post-hook 来控制 Nginx，确保 80 端口可用
        ~/.acme.sh/acme.sh   --issue -d "$DOMAIN" --keylength ec-256 --pre-hook "systemctl stop nginx" --post-hook "systemctl restart nginx"  --standalone --force
    else
        ~/.acme.sh/acme.sh   --issue -d "$DOMAIN" --keylength ec-256 --pre-hook "/etc/init.d/nginx stop || { echo -n ''; }" --post-hook "nginx -c /www/server/nginx/conf/nginx.conf || { echo -n ''; }"  --standalone --force
    fi
    
    if [[ $? -ne 0 ]]; then
        colorEcho $RED " 证书申请失败！请检查域名是否解析到本机 IP ($IP)。"
        exit 1
    fi

    CERT_FILE="/etc/trojan-go/${DOMAIN}.pem"
    KEY_FILE="/etc/trojan-go/${DOMAIN}.key"

    ~/.acme.sh/acme.sh  --install-cert -d "$DOMAIN" --ecc \
        --key-file       "$KEY_FILE"  \
        --fullchain-file "$CERT_FILE" \
        --reloadcmd     "service nginx force-reload"

    chmod 644 $CERT_FILE
    chmod 600 $KEY_FILE
}

# ==================== configNginx 改回静态文件 ====================
configNginx() {
    colorEcho $BLUE " 配置 Nginx 伪装站 (仅用于Trojan-Go回落)..."
    mkdir -p /usr/share/nginx/html
    
    # Nginx 监听 127.0.0.1:80，用于接收 Trojan-Go 转发的回落流量
    cat > $NGINX_CONF_PATH${DOMAIN}.conf <<EOF
server {
    listen 127.0.0.1:80;
    server_name ${DOMAIN};
    root /usr/share/nginx/html;
    
    # 静态文件配置，如果 /usr/share/nginx/html/index.html 存在，则会展示
    location / {
        index index.html index.htm;
    }
}
EOF
}
# ==========================================================

downloadFile() {
    SUFFIX=$(archAffix)
    if [[ -z "$SUFFIX" ]]; then
        colorEcho $RED " 不支持的架构"
        exit 1
    fi

    # 获取最新版本
    TAG_URL="${V6_PROXY}https://api.github.com/repos/p4gefau1t/trojan-go/releases/latest"
    VERSION=$(curl -sL ${TAG_URL} | grep "tag_name" | cut -d '"' -f 4)
    if [[ -z "$VERSION" ]]; then
        VERSION="v0.10.6" # Fallback
    fi
    
    DOWNLOAD_URL="${V6_PROXY}https://github.com/p4gefau1t/trojan-go/releases/download/${VERSION}/trojan-go-linux-${SUFFIX}.zip"
    
    wget -O /tmp/${ZIP_FILE}.zip "$DOWNLOAD_URL"
    if [[ ! -f /tmp/${ZIP_FILE}.zip ]]; then
        colorEcho $RED " trojan-go安装文件下载失败，请检查网络或重试"
        exit 1
    fi
}

installTrojan() {
    colorEcho $BLUE " 安装 trojan-go..."
    rm -rf /tmp/${ZIP_FILE}
    unzip /tmp/${ZIP_FILE}.zip  -d /tmp/${ZIP_FILE}
    cp /tmp/${ZIP_FILE}/trojan-go /usr/bin
    cp /tmp/${ZIP_FILE}/example/trojan-go.service /etc/systemd/system/
    
    # 确保 User=nobody 被移除，与原脚本一致
    sed -i '/User=nobody/d' /etc/systemd/system/trojan-go.service
    
    systemctl daemon-reload
    systemctl enable trojan-go
    rm -rf /tmp/${ZIP_FILE}
    colorEcho $BLUE " trojan-go安装成功！"
}

# ==================== 恢复最初的配置结构 ====================
configTrojan() {
    mkdir -p /etc/trojan-go
    cat > $CONFIG_FILE <<-EOF
{
    "run_type": "server",
    "local_addr": "::",
    "local_port": ${PORT},
    "remote_addr": "127.0.0.1",
    "remote_port": 80,
    "password": [
        "$PASSWORD"
    ],
    "ssl": {
        "cert": "${CERT_FILE}",
        "key": "${KEY_FILE}",
        "sni": "${DOMAIN}",
        "alpn": [
            "http/1.1"
        ],
        "session_ticket": true,
        "reuse_session": true,
        "fallback_addr": "127.0.0.1",
        "fallback_port": 80
    },
    "tcp": {
        "no_delay": true,
        "keep_alive": true,
        "prefer_ipv4": false
    },
    "mux": {
        "enabled": false,
        "concurrency": 8,
        "idle_timeout": 60
    },
    "websocket": {
        "enabled": ${WS},
        "path": "${WSPATH}",
        "host": "${DOMAIN}"
    },
    "mysql": {
      "enabled": false,
      "server_addr": "localhost",
      "server_port": 3306,
      "database": "",
      "username": "",
      "password": "",
      "check_rate": 60
    },
    "api": {
        "enabled": true,
        "api_addr": "127.0.0.1",
        "api_port": 10000
    },
    "log_level": 2,
    "log_file": "/etc/trojan-go/main.log"
}
EOF
}
# ==========================================================

setSelinux() {
    if [[ -s /etc/selinux/config ]] && grep 'SELINUX=enforcing' /etc/selinux/config; then
        sed -i 's/SELINUX=enforcing/SELINUX=permissive/g' /etc/selinux/config
        setenforce 0
    fi
}

setFirewall() {
    # 这里的防火墙逻辑与原始脚本保持一致
    res=$(which firewall-cmd 2>/dev/null)
    if [[ $? -eq 0 ]]; then
        systemctl status firewalld > /dev/null 2>&1
        if [[ $? -eq 0 ]];then
            firewall-cmd --permanent --add-service=http
            firewall-cmd --permanent --add-service=https
            if [[ "$PORT" != "443" ]]; then
                firewall-cmd --permanent --add-port=${PORT}/tcp
            fi
            firewall-cmd --reload
        fi
    else
        res=$(which iptables 2>/dev/null)
        if [[ $? -eq 0 ]]; then
            # 简化iptables检查，直接添加规则
            iptables -I INPUT -p tcp --dport 80 -j ACCEPT
            iptables -I INPUT -p tcp --dport 443 -j ACCEPT
            if [[ "$PORT" != "443" ]]; then
                iptables -I INPUT -p tcp --dport ${PORT} -j ACCEPT
            fi
        else
            res=$(which ufw 2>/dev/null)
            if [[ $? -eq 0 ]]; then
                res=$(ufw status | grep -i inactive)
                if [[ "$res" = "" ]]; then
                    ufw allow http/tcp
                    ufw allow https/tcp
                    if [[ "$PORT" != "443" ]]; then
                        ufw allow ${PORT}/tcp
                    fi
                fi
            fi
        fi
    fi
}


start() {
    stopNginx
    startNginx
    systemctl restart trojan-go
    sleep 2
    
    res=$(ss -ntlp| grep ${PORT} | grep trojan-go)
    if [[ "$res" = "" ]]; then
        colorEcho $RED " trojan-go启动失败，请检查端口是否被占用！"
    else
        colorEcho $BLUE " trojan-go启动成功"
    fi
}

main() {
    checkSystem
    getData # 从 ${IP}.json 读取配置
    
    # 确保安装基础工具和依赖
    $CMD_INSTALL wget unzip tar openssl socat cron
    
    installNginx
    setFirewall
    getCert
    configNginx

    downloadFile
    installTrojan
    configTrojan

    setSelinux

    start
    
    colorEcho $GREEN "=============================================="
    colorEcho $GREEN " Trojan-Go 安装完成！"
    colorEcho $GREEN "=============================================="
    colorEcho $BLUE " IP: ${IP}"
    colorEcho $BLUE " 域名: ${DOMAIN}"
    colorEcho $BLUE " 端口: ${PORT}"
    colorEcho $BLUE " 密码: ${PASSWORD}"
    if [[ "$WS" == "true" ]]; then
        colorEcho $BLUE " WS路径: ${WSPATH}"
    fi
    colorEcho $BLUE " 配置文件: ${CONFIG_FILE}"
    colorEcho $GREEN "=============================================="
}

main