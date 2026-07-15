# AssetForge 运维手册（照抄可用）

## 服务器
- 阿里云新加坡 2C1G：公网 `47.84.32.235`，应用端口 `3000`（安全组已放行 22/3000）
- 线上地址：**http://47.84.32.235:3000**
- 登录：阿里云控制台「远程连接」，进去是 admin 用户
- **切 root**（每次都要，root 密码在用户处）：
  ```bash
  sudo su -
  ```
- 应用目录：`/root/af-app`（server.js、start.sh 含全部 env、`data/` 任务+画廊数据）
- 进程：pm2（name=assetforge，开机自启）。**pm2 前必须先加载 nvm**：
  ```bash
  export NVM_DIR=/root/.nvm; . $NVM_DIR/nvm.sh
  ```

## 更新版本（标准流程）
本地（Mac）：
```bash
cd ~/Projects/asset-forge
npm run build
rm -rf /tmp/af-bundle && mkdir -p /tmp/af-bundle
cp -r .next/standalone/. /tmp/af-bundle/
mkdir -p /tmp/af-bundle/.next && cp -r .next/static /tmp/af-bundle/.next/static
cp -r public /tmp/af-bundle/public 2>/dev/null || true
tar -czf /tmp/af-standalone-vXXX.tar.gz -C /tmp/af-bundle .
gh release create vX.X.X /tmp/af-standalone-vXXX.tar.gz --title "vX.X.X 说明" --notes "..."
```
服务器（切 root 后）：
```bash
export NVM_DIR=/root/.nvm; . $NVM_DIR/nvm.sh
cd /root/af-app
curl -fL --retry 3 -o af-new.tar.gz https://github.com/Kalexzhu/asset-forge/releases/download/vX.X.X/af-standalone-vXXX.tar.gz
tar -xzf af-new.tar.gz && \rm -f af-new.tar.gz
pm2 restart assetforge
curl -s -o /dev/null -w "本机: HTTP %{http_code}\n" http://127.0.0.1:3000
```
要点：**覆盖解压、绝不 `rm -rf /root/af-app`**（会把 data/ 画廊删掉）；`\rm` 带反斜杠绕过 rm -i 别名。

## 回滚
把上面 URL 的版本号换成旧版（Release 都在 GitHub 留着），同样解压+restart。

## 常用排查
```bash
pm2 status / pm2 logs assetforge --lines 30 --nostream / pm2 restart assetforge
ss -tlnp | grep 3000          # 是否监听
curl -s http://127.0.0.1:3000 # 本机可达
du -sh /root/af-app/data      # 数据体积（画廊大了可在网页里删）
```

## 已踩的坑（别再踩）
- **pm2: command not found** → 忘了加载 nvm，先跑上面 export 两行
- **在服务器 npm install/build** → 1G 内存必崩（unrs-resolver postinstall），永远用预构建包
- **两个部署脚本并行跑** → 第二个 rm -rf 会把第一个的目录删了（uv_cwd 报错），跑前 `pkill -f deploy`
- **网页粘贴含 `set -e` 的脚本** → 任何一条失败直接断连，脚本务必落盘后 `bash file` 执行
- **rm 有 -i 别名** → 会吃掉后续粘贴的命令，用 `\rm`
- 本机(Mac)出站 22 被封 → 无法直接 SSH，运维一律走阿里云网页终端
- env 全在 `/root/af-app/start.sh` 里（改 key/开关 MOCK 在这改，改完 pm2 restart）
- Tripo：API 积分与网页积分分开，`GET /v2/openapi/user/balance` 查余额；balance=0 时转3D报"点数不足"属正常
