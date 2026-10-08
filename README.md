# AI 能力测评系统

以对话为主要形式的 AI 使用能力测评系统：教师建题、组建班级、发布测评任务，学生与
AI 测评官多轮对话完成测评，系统自动出题、追问、评分并给出总分。

## 开发分支

每个独立需求使用单独分支，`integration/v9` 汇总所有修改供本地试用。详见 [分支工作约定](docs/branch-workflow.md)。默认前端为 `frontend-v9`。

## 服务器部署（Docker，推荐）

服务器只要装了 Docker（含 compose 插件），**不需要装 Java、Maven、Python、Node**——
三个镜像都在容器里编译。

```bash
# 1) 上传代码到服务器（git clone 或 scp 都行），进入项目根目录
cd ai-competency-evaluation-system

# 2) 配置环境变量
cp .env.example .env
vi .env      # 必填三项：DB_PASSWORD、AGENT_SERVICE_TOKEN、DEEPSEEK_API_KEY
             # AGENT_SERVICE_TOKEN 随便一串长随机字符即可，Java 与 Agent 会自动共用

# 3) 构建并启动（首次 3~6 分钟，主要是下载依赖）
docker compose up -d --build

# 4) 看状态与日志
docker compose ps
docker compose logs -f backend agent
```

浏览器访问 **http://<服务器IP>:8088**（端口由 `.env` 里的 `FRONTEND_PORT` 决定）。

打开页面后第一次要**注册一个教师账号**才能建题、建班（系统不带任何预置账号）。

### 端口与网络

| 服务 | 容器内 | 宿主机 | 说明 |
|---|---|---|---|
| frontend（nginx） | 80 | `FRONTEND_PORT`（默认 8088） | 唯一需要对外开放的端口 |
| backend | 8080 | `BACKEND_PORT`（默认 8080） | 只在要用 curl 调接口时暴露；纯前端访问可删掉这段 `ports` |
| agent | 8090 | 不暴露 | 只有后端能访问 |
| mysql / redis | 3306 / 6379 | 不暴露 | 只有容器之间互相访问 |

前端页面和接口是**同源**的：nginx 把 `/api/` 反向代理到后端容器，所以浏览器侧没有跨域问题，
也不需要配 HTTPS 证书才能跑（要上 HTTPS 的话在 nginx 前面再挂一层或直接给这个容器配证书）。

nginx 配置里特意关掉了对 `/api/` 的响应缓冲（`proxy_buffering off`），
否则测评对话的 SSE 会被攒着一次性发出，"逐字输出"的效果会消失。

### 数据库初始化

`database.sql` 会在 MySQL **首次启动（数据卷为空）** 时自动建表，脚本可重复执行。
系统不预置任何账号，第一次进去自己注册教师端账号即可。

**改过表结构后先跑迁移，不要直接删卷。** `database.sql` 是幂等的：建表段落用
`CREATE TABLE IF NOT EXISTS`，后面的 ALTER 段落按 `information_schema` 判断再执行，
所以对已有库直接再跑一遍就是「补列 / 补索引」，数据不动：

```bash
# Docker 部署：在项目根目录，借容器里的 mysql 客户端执行（MySQL 没有对宿主机暴露端口）
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < database.sql

# 或不用 Docker 的部署（脚本里已带 CREATE DATABASE / USE，不用指定库名）
mysql -uroot -p < database.sql
```

只有在想要一份干净数据时才删卷（**会丢数据**）：

```bash
docker compose down -v && docker compose up -d
```

### 常用运维命令

```bash
docker compose ps                      # 看状态
docker compose logs -f backend         # 跟后端日志
docker compose restart backend         # 重启单个服务
docker compose up -d --build backend   # 改完后端代码后重新构建这一个
docker compose down                    # 停止（保留数据）
docker compose down -v                 # 停止并删除数据库数据（危险）
```

### 更新已部署的服务器

开发机（本机）执行一条命令即可完成「构建 → 上传 → 重启 → 自检」：

```bash
./deploy/release.sh            # 全量：后端 + 前端 + Agent
./deploy/release.sh frontend   # 只发前端（改页面/样式时最快）
./deploy/release.sh backend    # 只发后端
./deploy/release.sh agent      # 只发 Agent
```

脚本默认目标是 `root@120.26.93.206`、应用目录 `/opt/ai-assessment`，可用环境变量覆盖：

```bash
SERVER=root@其他服务器 APP_DIR=/opt/xxx ./deploy/release.sh
```

**为什么在本机构建、上传产物**：那台服务器只有 2 核 1.6G 内存，跑 Maven / npm 构建
容易把内存吃满，一旦 OOM，同机上的静态页也会跟着挂。所以构建放在本机，服务器只接产物。

脚本做的事：构建并上传后端 jar、前端 `dist`、Agent 源码（依赖有变化才重装 venv），
重启两个 systemd 服务，最后自检「应用首页 / 朋友的静态页 / 接口代理」三项。
它不会碰 `/photoelectric/`，也不会覆盖服务器上的 `.env`。

**发布带表结构变更的版本时**，先按上面的说明在服务器上跑一遍 `database.sql` 再重启
后端：新版实体（比如 `users.phone` / `users.email`）会按列名查询，库里的列没补上
会直接报错。`database.sql` 幂等，重复执行没有副作用。

数据都在命名卷 `assessment-mysql` / `assessment-redis` 里，`down` 不会丢；
`down -v` 才会删。备份用：

```bash
docker compose exec mysql mysqldump -uroot -p"$DB_PASSWORD" ai_assessment > backup.sql
```

### 不用 Docker 的部署

也可以照旧用本机进程跑（Java 21 + Python 3 + MySQL + Redis + Nginx 托管前端静态文件）：

```bash
cd frontend-ai-assessment && npm install && npm run build   # 产物在 dist/，交给 nginx
```

前端构建时用 `VITE_API_BASE` 指定后端地址；与接口同源时留空即可（默认就是 `/api`）。

### 前端热更新开发（后端跑在 Docker 里）

改前端时想要热更新、又不想在宿主机装 MySQL/Redis/Java/Python：

```bash
docker compose up -d mysql redis agent backend        # 基础设施与后端跑在容器里
cd frontend-ai-assessment && npm install
VITE_API_BASE=http://localhost:8080/api npm run dev -- --port 4174
```

## 文档

| 文档 | 内容 |
|---|---|
| [整体功能文档](docs/整体功能文档.md) | 角色、端到端流程、功能清单、业务规则、状态枚举、接口清单 |
| [模块设计架构文档](docs/模块设计架构文档.md) | 总体架构、模块划分、数据模型、部署配置、权限与错误处理、技术债 |
| [Agent设计文档](docs/Agent设计文档.md) | Python Agent 的边界、图结构、出题引擎、提示词、流程编排、扩展点 |
| [功能完善文档（MVP）](docs/功能完善文档-MVP.md) | 维度分/考察点分、能力等级、班级隔离、能力可视化与考察点词表 2.0 |
| [用户画像模块设计](docs/用户画像模块设计.md) | 画像算法如何替换（策略模式）、扩展步骤与示例 |
| [差距复核-当前状态](docs/差距复核-当前状态.md) | 相对原型的功能差距、已补项与已知取舍 |

## 工程结构

| 目录 | 说明 | 端口 |
|---|---|---|
| `frontend-ai-assessment/` | React + Vite 前端（学生端 / 教师端） | 4174 |
| `backend-java/` | Spring Boot 业务后端（账号、权限、题库、班级、任务） | 8080 |
| `agent-python/` | FastAPI + LangGraph 测评 Agent（出题、追问、评分、收尾） | 8090 |
| `database.sql` | 建表脚本（幂等，含增量迁移段） | — |
| `docker-compose.yml` / `.env.example` | 五个服务一键部署（含前端 nginx），环境变量模板 | — |

## 快速开始

依赖：MySQL 8、Redis 7、Java 21、Python 3、Node.js。

```bash
# 1) 建表（幂等，可重复执行）
mysql -uroot -p < database.sql

# 2) Python Agent
cd agent-python
python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt   # 只跑服务可装 requirements.txt
cp .env.example .env          # 填 AGENT_SERVICE_TOKEN 与 DEEPSEEK_API_KEY
./.venv/bin/uvicorn main:app --reload --port 8090

# 3) Java 后端（另开终端）
cd backend-java && ./mvnw spring-boot:run

# 4) 前端（另开终端）
cd frontend-ai-assessment && npm install && npm run dev -- --port 4174
```

或者用一条命令拉起后三个服务（需要本机已启动 MySQL 与 Redis、已准备 `agent-python/.env`）：

```bash
./start-local.sh
```

访问 http://localhost:4174 ，第一次使用先注册教师端账号。

## 测试

```bash
./check.sh              # 三端：Agent 单测 + 后端单测 + 前端 lint 与生产构建（CI 跑的是同一份）
./check.sh agent        # 也可以只跑某一段：agent / backend / frontend
```

`./check.sh` 默认用 `agent-python/.venv`，依赖装在 `requirements-dev.txt`
（生产镜像只装 `requirements.txt`，不带测试框架）。
`deploy/release.sh` 打后端包时也会跑一遍后端单测，急着发版可加 `SKIP_TESTS=1` 跳过。
