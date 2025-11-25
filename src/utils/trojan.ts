import { statusEnum } from 'src/enums'
import * as Log4js from 'log4js'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { execSync, sleep } from '.'
import { join } from 'path'
import {
  nginxConfText,
  nginxServerConfText,
  trojanConfigJson
} from 'src/config'

export const trojanPath = {
  /** 主目录 */
  root: '/etc/trojan-go',
  /** 配置文件路径 */
  configFile: '/etc/trojan-go/config.json',
  /** 宝塔 nginx 路径 */
  btNginx: '/www/server/panel/vhost/nginx/',
  /** nginx 路径 */
  nginxConf: '/etc/nginx/conf.d/',
  zipFile: 'trojan-go'
}

export async function startNginx(
  bt: boolean,
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  await execSync(
    bt ? '/etc/init.d/nginx start' : 'systemctl start nginx',
    logInfo,
    logError
  )
}

export async function stopNginx(
  bt: boolean,
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  await execSync(
    bt ? '/etc/init.d/nginx stop' : 'systemctl stop nginx',
    logInfo,
    logError
  )
}

export async function trojanGoStatus(
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
): Promise<statusEnum> {
  const tCmd = await execSync('command -v trojan-go', logInfo, logError)
  if (!tCmd) return statusEnum.NotInstalled
  if (!existsSync(trojanPath.configFile)) return statusEnum.NotInstalled
  const port = await execSync(
    `grep local_port ${trojanPath.configFile} | cut -d: -f2 | tr -d \",' '`,
    logInfo,
    logError
  )
  const res = await execSync(
    `ss -ntlp | grep ${port} | grep trojan-go`,
    logInfo,
    logError
  )
  return res ? statusEnum.Started : statusEnum.NotStarted
}

export async function installNginx(
  bt: boolean,
  pmt: string,
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  if (bt) {
    const nginx = await execSync('which nginx 2>/dev/null', logInfo, logError)
    if (!nginx) {
      throw new Error('>> nginx is not installed in BT Panel')
    }
    return
  }
  if (pmt === 'yum') {
    const epel = await execSync(
      `${pmt} install -y epel-release`,
      logInfo,
      logError
    )
    if (epel) {
      execSync(
        `echo '[nginx-stable]
            name=nginx stable repo
            baseurl=http://nginx.org/packages/centos/$releasever/$basearch/
            gpgcheck=1
            enabled=1
            gpgkey=https://nginx.org/keys/nginx_signing.key
            module_hotfixes=true' > /etc/yum.repos.d/nginx.repo
          `,
        logInfo,
        logError
      )
    }
  }
  const nginx = await execSync(`${pmt} install -y nginx`, logInfo, logError)
  if (!nginx) {
    throw new Error('>> nginx installation failed')
  }
  await execSync('systemctl enable nginx', logInfo, logError)
}

// 获取防火墙
export async function setFirewall(
  port: number,
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  const firewallCmd = await execSync(
    'which firewall-cmd 2>/dev/null',
    logInfo,
    logError
  )
  if (firewallCmd) {
    const firewalld = await execSync(
      'systemctl status firewalld > /dev/null 2>&1',
      logInfo,
      logError
    )
    if (firewalld) {
      await execSync(
        'firewall-cmd --permanent --add-service=http',
        logInfo,
        logError
      )
      await execSync(
        'firewall-cmd --permanent --add-service=https',
        logInfo,
        logError
      )
      if (port !== 443) {
        await execSync(
          `firewall-cmd --permanent --add-port=${port}/tcp`,
          logInfo,
          logError
        )
      }
      await execSync('firewall-cmd --reload', logInfo, logError)
      return
    }
    const nl = await execSync(
      `iptables -nL | nl | grep FORWARD | awk '{print $1}'`,
      logInfo,
      logError
    )
    if (nl !== '3') {
      await execSync(
        'iptables -I INPUT -p tcp --dport 80 -j ACCEPT',
        logInfo,
        logError
      )
      await execSync(
        'iptables -I INPUT -p tcp --dport 443 -j ACCEPT',
        logInfo,
        logError
      )
      if (port !== 443) {
        await execSync(
          `iptables -I INPUT -p tcp --dport ${port} -j ACCEPT`,
          logInfo,
          logError
        )
      }
    }
    return
  }
  const iptables = await execSync(
    'which iptables 2>/dev/null',
    logInfo,
    logError
  )
  if (iptables) {
    await execSync(
      'iptables -I INPUT -p tcp --dport 80 -j ACCEPT',
      logInfo,
      logError
    )
    await execSync(
      'iptables -I INPUT -p tcp --dport 443 -j ACCEPT',
      logInfo,
      logError
    )
    if (port !== 443) {
      await execSync(
        `iptables -I INPUT -p tcp --dport ${port} -j ACCEPT`,
        logInfo,
        logError
      )
    }
    return
  }
  const ufw = await execSync('which ufw 2>/dev/null', logInfo, logError)
  if (ufw) {
    const ufwStatus = await execSync(
      'ufw status | grep -i inactive',
      logInfo,
      logError
    )
    if (!ufwStatus) {
      await execSync('ufw allow http/tcp', logInfo, logError)
      await execSync('ufw allow https/tcp', logInfo, logError)
      if (port !== 443) {
        await execSync(`ufw allow ${port}/tcp`, logInfo, logError)
      }
    }
  }
}

// 获取证书
export async function obtainCertificate(
  bt: boolean,
  pmt: string,
  domain: string,
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  await execSync(`mkdir -p ${trojanPath.root}`, logInfo, logError)
  await execSync(`${pmt} install -y socat openssl`, logInfo, logError)
  if (pmt === 'yum') {
    await execSync(`${pmt} install -y cronie`, logInfo, logError)
    await execSync('systemctl start crond', logInfo, logError)
    await execSync('systemctl enable crond', logInfo, logError)
  } else {
    await execSync(`${pmt} install -y cron`, logInfo, logError)
    await execSync('systemctl start cron', logInfo, logError)
    await execSync('systemctl enable cron', logInfo, logError)
  }
  await execSync(
    'curl -sL https://get.acme.sh | sh -s email=byron.zhuwenbo@gmail.com',
    logInfo,
    logError
  )
  await execSync('source ~/.bashrc', logInfo, logError)
  await execSync(
    '~/.acme.sh/acme.sh  --upgrade  --auto-upgrade',
    logInfo,
    logError
  )
  await execSync(
    '~/.acme.sh/acme.sh --set-default-ca --server letsencrypt',
    logInfo,
    logError
  )
  if (bt) {
    await execSync(
      `~/.acme.sh/acme.sh --issue -d ${domain} --keylength ec-256 --pre-hook "nginx -s stop || { echo -n ''; }" --post-hook "nginx -c /www/server/nginx/conf/nginx.conf || { echo -n ''; }" --standalone`,
      logInfo,
      logError
    )
  } else {
    await execSync(
      `~/.acme.sh/acme.sh --issue -d ${domain} --keylength ec-256 --pre-hook "systemctl stop nginx" --post-hook "systemctl restart nginx" --standalone`,
      logInfo,
      logError
    )
  }
  if (!existsSync(`~/.acme.sh/${domain}_ecc/ca.cer`)) {
    throw new Error('>> certificate acquisition failed(1)')
  }
  const pemPath = `${trojanPath.root}/${domain}.pem`
  const keyPath = `${trojanPath.root}/${domain}.key`
  await execSync(
    `~/.acme.sh/acme.sh  --install-cert -d $DOMAIN --ecc \
      --key-file       ${keyPath}  \
      --fullchain-file ${pemPath} \
      --reloadcmd     "service nginx force-reload"
      `,
    logInfo,
    logError
  )
  if (!existsSync(pemPath) || !existsSync(keyPath)) {
    throw new Error('>> certificate acquisition failed(2)')
  }
}

// 配置 nginx
export async function configNginx(
  bt: boolean,
  domain: string,
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  if (!bt) {
    if (!existsSync('/etc/nginx/nginx.conf.bak')) {
      await execSync(
        'mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak',
        logInfo,
        logError
      )
    }
    const res = await execSync('id nginx 2>/dev/null', logInfo, logError)
    let nginxText = nginxConfText()
    nginxText = nginxText.replace(
      '{{user}}',
      res !== '0' ? 'www-data' : 'nginx'
    )
    writeFileSync('/etc/nginx/nginx.conf', nginxText, {
      encoding: 'utf-8'
    })

    let serverText = nginxServerConfText()
    serverText = serverText.replace('{{server_name}}', domain)
    serverText = serverText.replace('{{root}}', join(__dirname, '../../html'))
    writeFileSync(join(trojanPath.nginxConf, `${domain}.conf`), serverText, {
      encoding: 'utf-8'
    })
    return
  }
}

export async function archAffix(
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  let suffix = ''
  const uname = await execSync('uname -m', logInfo, logError)
  switch (uname) {
    case 'i686':
    case 'i386':
      suffix = '386'
      break
    case 'amd64':
    case 'x86_64':
      suffix = 'amd64'
      break
    case 'amd64':
    case 'x86_64':
      suffix = 'amd64'
      break
  }
  return suffix
}

// 下载文件
export async function downloadTrojan(
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  const ver = await execSync(
    `curl -fsSL https://api.github.com/repos/p4gefau1t/trojan-go/releases | grep tag_name | sed -E 's/.*"v(.*)".*/\\1/' | head -n1`,
    logInfo,
    logError
  )
  const suffix = await archAffix(logInfo, logError)
  if (!suffix) {
    throw new Error('unsupported systems')
  }
  const url = `https://github.com/p4gefau1t/trojan-go/releases/download/v${ver}/trojan-go-linux-${suffix}.zip`
  await execSync(
    `wget -O /tmp/${trojanPath.zipFile}.zip ${url}`,
    logInfo,
    logError
  )
  if (!existsSync(`/tmp/${trojanPath.zipFile}.zip`)) {
    throw new Error('installation file download failed')
  }
}

// 安装文件
export async function installTrojan(
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  await execSync(`rm -rf /tmp/${trojanPath.zipFile}`, logInfo, logError)
  await execSync(
    `unzip /tmp/${trojanPath.zipFile}.zip -d /tmp/${trojanPath.zipFile}`,
    logInfo,
    logError
  )
  await execSync(
    `cp /tmp/${trojanPath.zipFile}/trojan-go /usr/bin`,
    logInfo,
    logError
  )
  await execSync(
    `cp /tmp/${trojanPath.zipFile}/example/trojan-go.service /etc/systemd/system/`,
    logInfo,
    logError
  )
  await execSync(
    `sed -i '/User=nobody/d' /etc/systemd/system/trojan-go.service`,
    logInfo,
    logError
  )
  await execSync(`systemctl daemon-reload`, logInfo, logError)
  await execSync(`systemctl enable trojan-go`, logInfo, logError)
  await execSync(`rm -rf /tmp/${trojanPath.zipFile}`, logInfo, logError)
}

// 配置 trojan
export async function configTrojan(
  port: number,
  domain: string,
  passwords: string[],
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  await execSync(`mkdir -p ${trojanPath.root}`, logInfo, logError)
  const config: typeof trojanConfigJson = JSON.parse(
    JSON.stringify(trojanConfigJson)
  )
  config.local_port = port
  config.password = passwords
  config.ssl.key = `${trojanPath.root}/${domain}.key`
  config.ssl.cert = `${trojanPath.root}/${domain}.pem`
  config.ssl.sni = domain
  writeFileSync(trojanPath.configFile, JSON.stringify(config, null, '\t'), {
    encoding: 'utf-8'
  })

  if (existsSync('/etc/selinux/config')) {
    const [err] = await execSync(
      `grep 'SELINUX=enforcing' /etc/selinux/config`,
      logInfo,
      logError
    )
    if (err) return
    // 将系统的 SELinux（安全增强型 Linux）状态从“强制模式 (Enforcing)” 切换为 “宽容模式 (Permissive)”
    await execSync(
      `sed -i 's/SELINUX=enforcing/SELINUX=permissive/g' /etc/selinux/config`,
      logInfo,
      logError
    )
    await execSync(`setenforce 0`, logInfo, logError)
  }
}

// 安装 BBR
export async function installBBR(
  pmt: string,
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  const bbr = await execSync(`lsmod | grep bbr`, logInfo, logError)
  if (bbr) return
  const openvz = await execSync(
    `hostnamectl | grep -i openvz`,
    logInfo,
    logError
  )
  // openvz机器，跳过安装
  if (openvz) return
  await execSync(
    `echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf`,
    logInfo,
    logError
  )
  await execSync(
    `echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf`,
    logInfo,
    logError
  )
  await execSync(`sysctl -p`, logInfo, logError)
  const _bbr = await execSync(`lsmod | grep bbr`, logInfo, logError)
  if (_bbr) return
  if (pmt === 'yum') {
    await execSync(
      `rpm --import https://www.elrepo.org/RPM-GPG-KEY-elrepo.org`,
      logInfo,
      logError
    )
    await execSync(
      `rpm -Uvh http://www.elrepo.org/elrepo-release-7.0-4.el7.elrepo.noarch.rpm`,
      logInfo,
      logError
    )
    await execSync(
      `${pmt} install -y --enablerepo=elrepo-kernel kernel-ml`,
      logInfo,
      logError
    )
    await execSync(`${pmt} remove -y kernel-3.*`, logInfo, logError)
    await execSync(`grub2-set-default 0`, logInfo, logError)
    await execSync(
      `echo "tcp_bbr" >> /etc/modules-load.d/modules.conf`,
      logInfo,
      logError
    )
  } else {
    await execSync(
      `${pmt} install -y --install-recommends linux-generic-hwe-16.04`,
      logInfo,
      logError
    )
    await execSync(`grub-set-default 0`, logInfo, logError)
    await execSync(
      `echo "tcp_bbr" >> /etc/modules-load.d/modules.conf`,
      logInfo,
      logError
    )
  }
}

export async function bbrReboot(
  logInfo?: Log4js.Logger,
  logError?: Log4js.Logger
) {
  // 为使BBR模块生效，系统将在30秒后重启
  logInfo?.info(
    '>> the system will restart in 30 seconds for the BBR module to take effect'
  )
  await sleep(30000)
  await execSync('reboot', logInfo, logError)
}
