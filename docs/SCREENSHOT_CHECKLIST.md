# Screenshot checklist

Every screenshot for the submission, with what to run and what it should show. Request
numbers (1.1, 2.1, ...) match the Postman collection.

Tips:

- For the Postman screenshots, use the **EquipHub - EC2** environment, so the URL bar shows
  `http://<EC2-1-PUBLIC-IP>:3000/...`. Keep the status code and the response body visible.
- For "next to the MongoDB document": put Postman on one half of the screen and Atlas
  (**Browse Collections**) on the other. In Atlas, filter by the value from the response,
  for example `{ "_id": ObjectId("<id from the response>") }` or `{ "email": "<email>" }`.
- The **Test Results** tab in Postman shows the passing tests; include it where it fits.

## A. Code

| # | Screenshot | What it should show |
|---|---|---|
| A1 | `equipment-service/models/Equipment.js` | The schema rules, and `mongoose.model('Equipment', equipmentSchema, 'equipment')`, with the collection name passed as the 3rd argument |
| A2 | `loan-service/models/Loan.js` | The schema, the three indexes, and `mongoose.model('Loan', loanSchema, 'loans')` |
| A3 | `registration-service/models/User.js` | The schema (password `select: false`, unique email) and `mongoose.model('User', userSchema, 'users')` |
| A4 | `gateway/routeTable.js` | The whole route table: every route with its roles (all role rules in one place) |
| A5 | `nginx/nginx.conf` | The `upstream` with `equipment-1:3003` and `equipment-2:3003`, and `listen 8080` |
| A6 | `equipment-service/Dockerfile` and `docker-compose.yml` | The production-ready Dockerfile (pinned image, `npm ci --omit=dev`, `USER node`), and the compose file with two replicas behind `equipment-lb` |
| A7 | `.gitignore`, and `git status` with every `.env` present | `.env` is ignored, so `git status` lists no `.env` file (no secrets in the repo) |

## B. Docker on your Mac

Run `docker compose up --build` first.

| # | Screenshot | What to run | What it should show |
|---|---|---|---|
| B1 | Docker Desktop, **Images** | (after the build) | The six images `vnak3/gateway`, `registration-service`, `login-service`, `equipment-service`, `loan-service`, `equipment-lb`, all tagged `v1.0` |
| B2 | Docker Desktop, **Containers** | (while running) | Seven running containers: gateway, registration-service, login-service, equipment-1, equipment-2, equipment-lb, loan-service |
| B3 | Terminal | `docker compose ps` | All seven `Up` and `(healthy)`; only nginx's 8080 published for equipment, the replicas have no ports |
| B4 | Terminal | `curl -i http://localhost:3004/loans/me` | `403` `{"message":"Direct access is not allowed. Send requests through the API gateway."}` |
| B5 | Terminal | `docker compose logs -f equipment-1 equipment-2`, then send request 4.1 and 4.2 | Log lines alternating: `[equipment-1] GET /equipment 200 ...`, then `[equipment-2] GET /equipment 200 ...` |

## C. Docker Hub and EC2

| # | Screenshot | What to run | What it should show |
|---|---|---|---|
| C1 | hub.docker.com, your repositories | `./scripts/build-and-push.sh` on the Mac | Six `vnak3/...` repositories, each with tag `v1.0` |
| C2 | EC2 console, **Instances** | | The four instances running, with their type and public and private IPs |
| C3 | EC2 console, **Security Groups** (one per group) | | The inbound rules from docs/DEPLOY.md: 3000 open only on EC2-1, the other ports only from the gateway's (or loan's) security group |
| C4 | Atlas, **Network Access** | | The public IPs of EC2-2, EC2-3 and EC2-4 |
| C5 | EC2-1 terminal | `sudo docker images` and `sudo docker compose ps` | `vnak3/gateway:v1.0`; the gateway container `Up (healthy)` on 3000 |
| C6 | EC2-2 terminal | `sudo docker images` and `sudo docker compose ps` | The registration and login images; both containers healthy on 3001 and 3002 |
| C7 | EC2-3 terminal | `sudo docker images` and `sudo docker compose ps` | The equipment and equipment-lb images; equipment-1, equipment-2 and equipment-lb healthy, only 8080 published |
| C8 | EC2-4 terminal | `sudo docker images` and `sudo docker compose ps` | The loan image; loan-service healthy on 3004 |
| C9 | EC2-3 terminal | `sudo docker compose logs -f equipment-1 equipment-2`, then send 4.1 and 4.2 from Postman (EC2) | The two replicas taking turns, like B5 |
| C10 | EC2-3 terminal | `sudo docker compose logs equipment-lb` | nginx lines ending in `-> <ip>:3003`, alternating between the two replica addresses |

## D. Every API call through the EC2 public IP, next to its MongoDB document

| # | Postman request | Expected response | Atlas document to show |
|---|---|---|---|
| D1 | 1.1 Login admin | `200`, a `token`, `user.role` `admin` | `userdb.users`, the admin (`email` from ADMIN_EMAIL): `password` is a bcrypt hash (`$2b$...`), not the real password |
| D2 | 1.2 Register student (Sokha) | `201`, `user.role` `user`, no `password` field | `userdb.users`, the new student (filter by the email in the response) |
| D3 | 1.3 Login student | `200`, a `token` | The same student document |
| D4 | 1.4 Register second student, 1.5 Login | `201`, then `200` | `userdb.users`, Dara's document |
| D5 | 1.6 Admin creates a second admin | `201`, `user.role` `admin` | `userdb.users`, the IT staff document with `role: "admin"` |
| D6 | 2.1 Create Canon EOS M50 | `201`, `availableQty` `3` although 99 was sent, `instance` shown | `equipmentdb.equipment`, the Canon with `totalQty: 3`, `availableQty: 3` |
| D7 | 2.2 to 2.5 Create the other items | `201` each | `equipmentdb.equipment`, the five new items |
| D8 | 2.6 List all equipment (as a student) | `200`, `count`, `instance` | `equipmentdb.equipment`, the collection |
| D9 | 2.7 List cameras, 2.8 List in stock | `200`, only cameras / only items with units left | The same documents |
| D10 | 2.9 Get one item | `200`, the Canon | The Canon document |
| D11 | 2.10 Update item | `200`, `totalQty` `4`, `availableQty` `4` | The Canon with the new values and a newer `updatedAt` |
| D12 | 3.1 Student borrows the Canon | `201`, `status` `pending`, `equipmentName` copied | `loandb.loans`, the new loan; `equipmentdb.equipment`, the Canon's `availableQty` one lower |
| D13 | 3.2 Student views own loans, 3.3 Admin lists pending loans | `200`, the loan is listed | `loandb.loans`, the same loan |
| D14 | 3.4 Admin approves | `200`, `status` `approved`, `dueDate` 3 days ahead | The loan with `status: "approved"` and `dueDate` |
| D15 | 3.5 Admin marks it returned | `200`, `status` `returned`, `returnedAt` | The loan with `returnedAt`; the Canon's `availableQty` back up |
| D16 | 3.6 Borrow projector, 3.7 Cancel | `201`, then `200` `cancelled` | The loan with `status: "cancelled"`; the projector back to full stock |
| D17 | 3.8 Borrow tripod, 3.9 Admin rejects | `201`, then `200` `rejected` | The loan with `status: "rejected"`; the tripods back to full stock |
| D18 | 3.10 All loans, 3.11 Overdue loans | `200` (overdue is usually empty; to show one, change an approved loan's `dueDate` to yesterday in Atlas) | `loandb.loans` |
| D19 | 3.12 Stock is back | `200`, `availableQty` equals `totalQty` | The Canon document |
| D20 | 4.1 and 4.2 GET /equipment | `200` both, `instance` `equipment-1` in one and `equipment-2` in the other | Two screenshots side by side (plus C9) |
| D21 | `loandb.loans` Indexes tab in Atlas | | `userId_1_status_1`, `status_1_dueDate_1`, and the partial unique `userId_1_equipmentId_1` |

## E. Negative tests (Postman, EC2)

| # | Postman request | Expected response |
|---|---|---|
| E1 | 5.1 Login with a wrong password | `401` "Invalid email, password or role" |
| E2 | 5.2 Login with a wrong email | `401` "Invalid email, password or role" |
| E3 | 5.3 Login with a wrong role | `401` "Invalid email, password or role" |
| E4 | 5.4 Register with a duplicate email | `409` "An account with this email already exists" |
| E5 | 5.5 Register as admin on the public route | `403` "Admins can only be created by an admin" |
| E6 | 5.6 Student token on POST /register/admin | `403` "Access denied: admin role required" |
| E7 | 5.7 No token | `401` "Token missing: send Authorization: Bearer <token>" |
| E8 | 5.8 Invalid token | `401` "Invalid token" |
| E9 | 5.9 Expired token | `401` "Token expired: log in again" |
| E10 | 5.10 Student token on POST /equipment | `403` "Access denied: admin role required" |
| E11 | 5.11 Admin token on POST /loans | `403` "Access denied: user role required" |
| E12 | 5.12 Direct call without x-internal-key | Local only (use B4 or the local environment): `403` "Direct access is not allowed..." On EC2 the port is closed to the internet: show the request timing out, or the security group rule (C3) |
| E13 | 5.14 Out of stock | `409` "Out of stock" |
| E14 | 5.15 Same item twice | `409` "You already have an active loan for this item" |
| E15 | 5.18 A 4th active loan | `409` "You already have 3 active loans (pending or approved)" |
| E16 | 5.19 days = 8 | `400` "days must be a whole number from 1 to 7" |
| E17 | 5.20 Invalid equipment id, 5.21 Invalid loan id | `400` "Invalid equipment id" / "Invalid loan id" |
| E18 | 5.22 Approve a loan that is not pending | `409` "Loan is returned, but it must be pending for this" |
| E19 | 5.23 Cancel someone else's loan | `403` "You can only cancel your own loans" |
| E20 | 5.24 Delete equipment while a unit is lent out | `409` "Can't delete: 1 unit(s) are reserved or lent out" |
| E21 | 5.28 Delete equipment once every unit is back | `200` "Equipment deleted" (after the cleanup requests 5.25 to 5.27) |
