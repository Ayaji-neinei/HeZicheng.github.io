# 个人网站（静态版）

一个纯静态的个人网站模板：没有构建步骤、没有依赖、没有框架，`index.html` + `style.css` 就是全部。

## 当前部署

| 项目 | 值 |
| --- | --- |
| 仓库 | `Ayaji-neinei/HeZicheng.github.io`（Public） |
| 分支 | `main`（根目录即站点根目录） |
| 站点地址 | https://ayaji-neinei.github.io/HeZicheng.github.io/ |

注意：仓库名 `HeZicheng.github.io` 与账号名 `Ayaji-neinei` 不一致，所以它是**项目站点**，网址里带仓库名。
想要最短网址 `https://ayaji-neinei.github.io/`，需要把仓库名改成与账号完全一致的 `Ayaji-neinei.github.io`。

首次发布需在仓库 **Settings → Pages → Source: Deploy from a branch → main → / (root) → Save** 保存一次。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面结构：顶栏、首屏（名字 + 一句话简介）、关于我、我的作品、联系方式、页脚 |
| `style.css` | 全部样式。主色、间距、字号集中在文件开头的 `:root` 变量里 |
| `.nojekyll` | 告诉 GitHub Pages 不要用 Jekyll 处理这个目录 |

## 本地预览

直接双击 `index.html` 就能看。想用本地服务器（行为和线上更接近）：

```bash
python -m http.server 8000
# 然后打开 http://127.0.0.1:8000
```

## 部署到 GitHub Pages

1. 在 GitHub 上新建一个仓库，例如 `my-site`（**公开**仓库才能免费用 Pages；私有仓库需要 Pro）。
2. 在本目录里初始化并推送：

   ```bash
   git init
   git add .
   git commit -m "Add personal website"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/my-site.git
   git push -u origin main
   ```

3. 打开仓库的 **Settings → Pages**，把 **Source** 设为 `Deploy from a branch`，
   **Branch** 选 `main`、目录选 `/ (root)`，保存。
4. 等一两分钟，网址就是：

   ```
   https://<你的用户名>.github.io/my-site/
   ```

### 想要更短的网址

把仓库名取成 `<你的用户名>.github.io`（例如 `zhangsan.github.io`），网址就直接是：

```
https://<你的用户名>.github.io/
```

## 改成你自己的内容

- `index.html` 里搜 `你的名字`、`一句话介绍你自己`、`you@example.com`、`your-name`，全部替换即可。
- 顶栏导航链接对应页面里的 `#about`、`#work`、`#contact` 三个分区，增删栏目时两处一起改。
- 作品卡片是三个 `<li class="card">`，想要几个就复制或删除几行。
- 主题色改 `style.css` 里 `:root` 的 `--accent`；不想要深色模式，删掉 `@media (prefers-color-scheme: dark)` 整段。
- 换头像：把 `.avatar` 那个圆点换成一个 `<img>`，例如
  `<img class="avatar" src="avatar.jpg" alt="你的名字" />`，再给 `.avatar` 加上 `object-fit: cover;`。
