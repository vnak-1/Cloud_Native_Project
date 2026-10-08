# EquipHub demo checklist

What the demo shows, grouped by grading criterion. Postman request numbers (1.1, 2.1, ...)
refer to `postman/EquipHub.postman_collection.json`, sent to the gateway on EC2-1
(`http://<EC2-1-PUBLIC-IP>:3000`). Commands marked EC2-n run on that instance, in
`~/Cloud_Native_Project/deploy/<folder>`.

## 1. Distributed architecture with Docker

| What | How | Expected |
|---|---|---|
| Overall design | Diagram in [README.md](../README.md#architecture) | Client → gateway → services; one database per service area |
| Four EC2 instances | AWS console → EC2 → Instances | Gateway, auth, equipment and loan instances, all running |
| Only the gateway is public | AWS console → Security Groups | Port 3000 open to the internet on EC2-1 only; 3001/3002, 8080 and 3004 open only to the instances that call them |
| Containers running | EC2-1 to EC2-4: `sudo docker compose ps` | 7 containers in total, all `healthy` |
| Images from Docker Hub | `deploy/*/docker-compose.yml`, hub.docker.com/u/vnak3 | `vnak3/<service>:v1.0`, built for linux/amd64 |
| Production-ready Dockerfile | `gateway/Dockerfile` (all services use the same pattern) | Pinned `node:24-alpine`, `npm ci --omit=dev`, `USER node`, `CMD ["node", "server.js"]` |
| Health checks and restarts | `deploy/*/docker-compose.yml` | `healthcheck` on `/health`, `restart: unless-stopped`, `init: true` |
| No secrets in the repository | `.gitignore`, then `git ls-files \| grep '\.env'` | `.env` is ignored; the command prints nothing |

## 2. JWT authentication and role-based access through the gateway

| Request | Expected |
|---|---|
| 1.1 Login admin | 200, JWT |
| 1.2 Register student | 201, role `user`, no password in the response |
| 1.3 Login student | 200, JWT |
| 1.6 Admin creates a second admin | 201 |
| 5.1 to 5.3 Wrong password, email or role | 401 "Invalid email, password or role" (same message for all three) |
| 5.5 Register as admin on the public route | 403 "Admins can only be created by an admin" |
| 5.6 Student token on POST /register/admin | 403 "Access denied: admin role required" |
| 5.7 No token | 401 "Token missing: send Authorization: Bearer &lt;token&gt;" |
| 5.8 Invalid token | 401 "Invalid token" |
| 5.9 Expired token | 401 "Token expired: log in again" |
| 5.10 Student token on POST /equipment | 403 "Access denied: admin role required" |
| 5.11 Admin token on POST /loans | 403 "Access denied: user role required" |

Role rules: [docs/ARCHITECTURE.md](ARCHITECTURE.md#api-gateway) (route table).

## 3. Database connectivity and CRUD

**Equipment CRUD (admin writes, everyone reads)**

| Request | Expected |
|---|---|
| 2.1 Create Canon (sends `availableQty: 99`) | 201, `availableQty` 3: the server sets stock |
| 2.6 List all equipment (as a student) | 200, `count` and `equipment` |
| 2.7 List cameras only | 200, cameras only |
| 2.9 Get one item | 200, the Canon |
| 2.10 Update `totalQty` 3 → 4 | 200, `totalQty` 4, `availableQty` 4 |
| 5.28 Delete an item once every unit is back | 200 "Equipment deleted" |

**Loan lifecycle (stock moves between two services)**

| Request | Expected |
|---|---|
| 3.1 Student borrows the Canon | 201, `pending`, `equipmentName` copied from equipment |
| 3.2 Student views own loans | 200, own loans only |
| 3.3 Admin lists pending loans | 200 |
| 3.4 Admin approves | 200, `approved`, `dueDate` = now + 3 days |
| 3.5 Admin marks it returned | 200, `returned`, `returnedAt` set |
| 3.7 Student cancels own pending loan | 200, `cancelled` |
| 3.9 Admin rejects a loan | 200, `rejected` |
| 3.11 Admin lists overdue loans | 200 |
| 3.12 Get the Canon again | `availableQty` equals `totalQty`: every ended loan gave its unit back |

**Business rules (folder 5, run in order)**

| Request | Expected |
|---|---|
| 5.14 Second student borrows the last unit | 409 "Out of stock" |
| 5.15 Same item twice | 409 "You already have an active loan for this item" |
| 5.18 A 4th active loan | 409 "You already have 3 active loans (pending or approved)" |
| 5.19 `days` = 8 | 400 "days must be a whole number from 1 to 7" |
| 5.20 Invalid equipment id | 400 "Invalid equipment id" |
| 5.22 Approve a loan that is already returned | 409 "Loan is returned, but it must be pending for this" |
| 5.23 Cancel someone else's loan | 403 "You can only cancel your own loans" |
| 5.24 Delete equipment while a unit is lent out | 409 "Can't delete: 1 unit(s) are reserved or lent out" |

**MongoDB Atlas**

| What | Where | Expected |
|---|---|---|
| One database per service area | Atlas → Browse Collections | `userdb.users`, `equipmentdb.equipment`, `loandb.loans` |
| Passwords hashed | `userdb.users` | `password` is a bcrypt hash (starts with `$2`) |
| Schemas | `*/models/*.js` | Mongoose schemas with validation, indexes and an explicit collection name |

## 4. Load balancer

| What | How | Expected |
|---|---|---|
| Requests alternate between replicas | Postman 4.1, then 4.2 | `"instance": "equipment-1"`, then `"equipment-2"` |
| The same in the logs | EC2-3: `sudo docker compose logs -f equipment-1 equipment-2` while sending 4.1 and 4.2 | `[equipment-1] GET /equipment 200` and `[equipment-2] GET /equipment 200`, in turn |
| Loan also goes through the load balancer | Same logs while sending 3.1 | `PATCH /internal/equipment/<id>/reserve 200` on one of the replicas |
| Configuration | `nginx/nginx.conf`, `deploy/ec2-3-equipment/docker-compose.yml` | Round-robin `upstream` over both replicas on 8080; the replicas publish no ports |

## 5. Services can't be reached directly

| Where | Command | Expected |
|---|---|---|
| Laptop | `curl --max-time 5 http://<EC2-4-PUBLIC-IP>:3004/health` | Times out: blocked by the security group |
| EC2-3 | `curl -s localhost:8080/equipment` | 403 "Direct access is not allowed. Send requests through the API gateway." |

## 6. Full test run

Postman → Run collection, all five folders in order (58 requests). Every test passes. 5.12
(direct call to a service) is skipped on EC2, because the security groups make the services
unreachable from outside.

## 7. Documentation

| Document | Contents |
|---|---|
| [README.md](../README.md) | Architecture diagram, services, running locally, Postman |
| [docs/ARCHITECTURE.md](ARCHITECTURE.md) | Every API, and the design decisions |
| [docs/DEPLOY.md](DEPLOY.md) | EC2 deployment, step by step |
| [postman/](../postman/) | Collection with tests, local and EC2 environments |
