import { statusEnum } from 'src/enums'
import { existsSync, writeFileSync } from 'fs'
import { nginxConfText, trojanConfigJson } from 'src/config'
import { nginxServerConfText } from 'src/config'
import { execSync, logInfo, sleep, to } from '.'
import { join } from 'path'

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

export async function startNginx(bt: boolean) {
  await execSync(bt ? '/etc/init.d/nginx start' : 'systemctl start nginx')
}

export async function stopNginx(bt: boolean) {
  await execSync(bt ? '/etc/init.d/nginx stop' : 'systemctl stop nginx')
}

export async function trojanGoStatus(): Promise<statusEnum> {
  const tCmd = await execSync('command -v trojan-go')
  if (!tCmd) return statusEnum.NotInstalled
  if (!existsSync(trojanPath.configFile)) return statusEnum.NotInstalled
  const port = await execSync(
    `grep local_port ${trojanPath.configFile} | cut -d: -f2 | tr -d \",' '`
  )
  const res = await execSync(`ss -ntlp | grep ${port} | grep trojan-go`)
  return res ? statusEnum.Started : statusEnum.NotStarted
}

export async function installNginx(bt: boolean, pmt: string) {
  if (bt) {
    const [, nginx] = await to(execSync('which nginx 2>/dev/null'))
    if (!nginx) {
      throw new Error('>> nginx is not installed in bt panel')
    }
    return
  }
  if (pmt === 'yum') {
    const epel = await execSync(`${pmt} install -y epel-release`)
    if (epel) {
      execSync(
        `echo '[nginx-stable]
            name=nginx stable repo
            baseurl=http://nginx.org/packages/centos/$releasever/$basearch/
            gpgcheck=1
            enabled=1
            gpgkey=https://nginx.org/keys/nginx_signing.key
            module_hotfixes=true' > /etc/yum.repos.d/nginx.repo
          `
      )
    }
  }
  const nginx = await execSync(`${pmt} install -y nginx`)
  if (!nginx) {
    throw new Error('>> nginx installation failed')
  }
  await execSync('systemctl enable nginx')
}

// 设置防火墙
export async function setFirewall(port: number) {
  const [, firewallCmd] = await to(execSync('which firewall-cmd 2>/dev/null'))
  if (firewallCmd) {
    const firewalld = await execSync(
      'systemctl status firewalld > /dev/null 2>&1'
    )
    if (firewalld) {
      await execSync('firewall-cmd --permanent --add-service=http')
      await execSync('firewall-cmd --permanent --add-service=https')
      if (port !== 443) {
        await execSync(`firewall-cmd --permanent --add-port=${port}/tcp`)
      }
      await execSync('firewall-cmd --reload')
      return
    }
    const nl = await execSync(
      `iptables -nL | nl | grep FORWARD | awk '{print $1}'`
    )
    if (nl !== '3') {
      await execSync('iptables -I INPUT -p tcp --dport 80 -j ACCEPT')
      await execSync('iptables -I INPUT -p tcp --dport 443 -j ACCEPT')
      if (port !== 443) {
        await execSync(`iptables -I INPUT -p tcp --dport ${port} -j ACCEPT`)
      }
    }
    return
  }
  const [, iptables] = await to(execSync('which iptables 2>/dev/null'))
  if (iptables) {
    await execSync('iptables -I INPUT -p tcp --dport 80 -j ACCEPT')
    await execSync('iptables -I INPUT -p tcp --dport 443 -j ACCEPT')
    if (port !== 443) {
      await execSync(`iptables -I INPUT -p tcp --dport ${port} -j ACCEPT`)
    }
    return
  }
  const [, ufw] = await to(execSync('which ufw 2>/dev/null'))
  if (ufw) {
    const ufwStatus = await execSync('ufw status | grep -i inactive')
    if (!ufwStatus) {
      await execSync('ufw allow http/tcp')
      await execSync('ufw allow https/tcp')
      if (port !== 443) {
        await execSync(`ufw allow ${port}/tcp`)
      }
    }
  }
}

// 获取证书
export async function obtainCertificate(pmt: string, domain: string) {
  await execSync(`mkdir -p ${trojanPath.root}`)
  await execSync(`${pmt} install -y socat openssl`)
  if (pmt === 'yum') {
    await execSync(`${pmt} install -y cronie`)
    await execSync('systemctl start crond')
    await execSync('systemctl enable crond')
  } else {
    await execSync(`${pmt} install -y cron`)
    await execSync('systemctl start cron')
    await execSync('systemctl enable cron')
  }
  await execSync(
    'curl -sL https://get.acme.sh | sh -s email=byron.zhuwenbo@gmail.com'
  )
  await execSync('source ~/.bashrc')
  await execSync('~/.acme.sh/acme.sh  --upgrade  --auto-upgrade')
  await execSync('~/.acme.sh/acme.sh --set-default-ca --server letsencrypt')
  await execSync(
    `~/.acme.sh/acme.sh --issue -d ${domain} --keylength ec-256 --pre-hook "systemctl stop nginx" --post-hook "systemctl restart nginx" --standalone`
  )
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
      `
  )
  if (!existsSync(pemPath) || !existsSync(keyPath)) {
    throw new Error('>> certificate acquisition failed(2)')
  }
}

// 配置 nginx
export async function configNginx(bt: boolean, domain: string) {
  if (bt) {
    if (!existsSync(`/www/server/panel/vhost/nginx/${domain}.conf`)) {
      throw new Error(`please add ${domain} to the bt panel and enable ssl`)
    }
  } else {
    if (!existsSync('/etc/nginx/nginx.conf.bak')) {
      await execSync('mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak')
    }
    const res = await execSync('id nginx 2>/dev/null')
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
  }
}

export async function archAffix() {
  let suffix = ''
  const uname = await execSync('uname -m')
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
export async function downloadTrojan() {
  const ver = await execSync(
    `curl -fsSL https://api.github.com/repos/p4gefau1t/trojan-go/releases | grep tag_name | sed -E 's/.*"v(.*)".*/\\1/' | head -n1`
  )
  const suffix = await archAffix()
  if (!suffix) {
    throw new Error('unsupported systems')
  }
  const url = `https://github.com/p4gefau1t/trojan-go/releases/download/v${ver}/trojan-go-linux-${suffix}.zip`
  await execSync(`wget -O /tmp/${trojanPath.zipFile}.zip ${url}`)
  if (!existsSync(`/tmp/${trojanPath.zipFile}.zip`)) {
    throw new Error('installation file download failed')
  }
}

// 安装文件
export async function installTrojan() {
  await execSync(`rm -rf /tmp/${trojanPath.zipFile}`)
  await execSync(
    `unzip /tmp/${trojanPath.zipFile}.zip -d /tmp/${trojanPath.zipFile}`
  )
  await execSync(`cp /tmp/${trojanPath.zipFile}/trojan-go /usr/bin`)
  await execSync(
    `cp /tmp/${trojanPath.zipFile}/example/trojan-go.service /etc/systemd/system/`
  )
  await execSync(
    `sed -i '/User=nobody/d' /etc/systemd/system/trojan-go.service`
  )
  await execSync(`systemctl daemon-reload`)
  await execSync(`systemctl enable trojan-go`)
  await execSync(`rm -rf /tmp/${trojanPath.zipFile}`)
}

// 配置 trojan
export async function configTrojan(
  bt: boolean,
  port: number,
  domain: string,
  passwords: string[]
) {
  await execSync(`mkdir -p ${trojanPath.root}`)
  const config: typeof trojanConfigJson = JSON.parse(
    JSON.stringify(trojanConfigJson)
  )
  config.local_port = port
  config.password = ['123456AAaa'].concat(passwords)
  config.ssl.sni = domain
  if (bt) {
    // /www/server/panel/vhost/cert/ota.byronzhu.cn/fullchain.pem
    if (!existsSync(`/www/server/panel/vhost/cert/${domain}/fullchain.pem`)) {
      throw new Error(
        `please configure the ${domain} certificate in the bt panel`
      )
    }
    config.ssl.key = `/www/server/panel/vhost/cert/${domain}/privkey.pem`
    config.ssl.cert = `/www/server/panel/vhost/cert/${domain}/fullchain.pem`
  } else {
    config.ssl.key = `${trojanPath.root}/${domain}.key`
    config.ssl.cert = `${trojanPath.root}/${domain}.pem`
  }

  writeFileSync(trojanPath.configFile, JSON.stringify(config, null, '\t'), {
    encoding: 'utf-8'
  })

  if (existsSync('/etc/selinux/config')) {
    const [err] = await execSync(`grep 'SELINUX=enforcing' /etc/selinux/config`)
    if (err) return
    // 将系统的 SELinux（安全增强型 Linux）状态从“强制模式 (Enforcing)” 切换为 “宽容模式 (Permissive)”
    await execSync(
      `sed -i 's/SELINUX=enforcing/SELINUX=permissive/g' /etc/selinux/config`
    )
    await execSync(`setenforce 0`)
  }
}

// 安装 BBR
export async function installBBR(pmt: string) {
  const bbr = await execSync(`lsmod | grep bbr`)
  if (bbr) return
  const openvz = await execSync(`hostnamectl | grep -i openvz`)
  // openvz机器，跳过安装
  if (openvz) return
  await execSync(`echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf`)
  await execSync(
    `echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf`
  )
  await execSync(`sysctl -p`)
  const _bbr = await execSync(`lsmod | grep bbr`)
  if (_bbr) return
  if (pmt === 'yum') {
    await execSync(`rpm --import https://www.elrepo.org/RPM-GPG-KEY-elrepo.org`)
    await execSync(
      `rpm -Uvh http://www.elrepo.org/elrepo-release-7.0-4.el7.elrepo.noarch.rpm`
    )
    await execSync(`${pmt} install -y --enablerepo=elrepo-kernel kernel-ml`)
    await execSync(`${pmt} remove -y kernel-3.*`)
    await execSync(`grub2-set-default 0`)
    await execSync(`echo "tcp_bbr" >> /etc/modules-load.d/modules.conf`)
  } else {
    await execSync(
      `${pmt} install -y --install-recommends linux-generic-hwe-16.04`
    )
    await execSync(`grub-set-default 0`)
    await execSync(`echo "tcp_bbr" >> /etc/modules-load.d/modules.conf`)
  }
}

export async function bbrReboot() {
  // 为使BBR模块生效，系统将在30秒后重启
  logInfo('System will restart in 30 seconds for the BBR module to take effect')
  await sleep(30000)
  await execSync('reboot')
}
