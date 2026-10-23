# Strava 活动海报 · Chrome 扩展

在 Strava 活动页一键读取该活动的轨迹，打开内置海报页，选好样式后导出 PNG。
海报页与网页版 MapToPoster 共用同一套渲染/导出代码，打包在扩展本地，不依赖网站部署。

## 安装（开发者模式）

1. 解压 `strava-poster-extension.zip`（或直接用本目录 `npm run build:ext` 生成的 `extension/dist/`）
2. Chrome 打开 `chrome://extensions`，打开右上角「开发者模式」
3. 点「加载已解压的扩展程序」，选择解压出的文件夹（含 manifest.json 的那一层）

## 使用

1. 登录 Strava，打开任意一个有 GPS 轨迹的活动页
2. 点右下角橙色按钮「🗺 生成活动海报」
3. 自动打开海报页：轨迹已载入并缩放到位，标题=活动名，副标题=「里程 · 日期」
4. 按需调整：地图模式（标准/艺术）、主题（含自定义主题的 新建/编辑/导出/导入）、
   地名标注、轨迹颜色与线宽、标题/副标题、坐标开关、海报尺寸
5. 点「导出 PNG 海报」下载

海报页也支持手动导入 GPX 文件（没有从 Strava 跳转进来时用）。

## 工作原理与限制

- 内容脚本在活动页同源请求 `https://www.strava.com/activities/{id}/export_gpx`
  （与 Strava 自带「··· → Export GPX」菜单下载的是同一个文件，走你的登录态），
  在本地解析、抽稀到 3000 点后经 chrome.storage 传给海报页；轨迹数据不离开浏览器。
- 需要已登录 Strava；手动录入/室内等无 GPS 的活动没有轨迹，会提示错误。
- 自定义主题保存在扩展页面的 localStorage 中（与网页版各自独立）。

## 重新构建

```bash
npm install
npm run build:ext   # 产物在 extension/dist/，并打包 extension/strava-poster-extension.zip
```
