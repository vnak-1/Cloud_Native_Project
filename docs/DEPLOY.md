# Deploying EquipHub to AWS EC2

EquipHub runs on four Ubuntu EC2 instances. Each one pulls its images from Docker Hub and
starts them with Docker Compose. Only the gateway (EC2-1) is reachable from the internet;
the other instances only accept traffic from the instances that need them, over private IPs.

| Instance | Runs | Deploy folder | Accepts traffic on |
|---|---|---|---|
| EC2-1 | gateway | `deploy/ec2-1-gateway` | 3000 from anywhere |
| EC2-2 | registration-service, login-service | `deploy/ec2-2-auth` | 3001, 3002 from EC2-1 |
| EC2-3 | nginx (equipment-lb), equipment-1, equipment-2 | `deploy/ec2-3-equipment` | 8080 from EC2-1 and EC2-4 |
| EC2-4 | loan-service | `deploy/ec2-4-loan` | 3004 from EC2-1 |

The instances talk to each other through **private IPs**, which stay the same when an
instance stops and starts. Public IPs change.

## 0. On your Mac first

1. **Push the images.** Log in to Docker Hub, then build and push all six images for x86
   (EC2 is x86, the Mac is ARM; the script takes care of that):

   ```bash
   docker login                     # username: vnak3
   ./scripts/build-and-push.sh
   ```

   On hub.docker.com you should see six repositories, each with the tag `v1.0`: gateway,
   registration-service, login-service, equipment-service, loan-service, equipment-lb.

2. **Push the repo to GitHub**, so each instance can download its deploy folder. Create an
   empty repository `equipment-lending-microservices` on GitHub (no README), then:

   ```bash
   git remote add origin https://github.com/vnak-1/equipment-lending-microservices.git
   git push -u origin main
   ```

3. **Have your secret values ready**: `INTERNAL_KEY`, `JWT_SECRET`, the admin password and
   your Atlas user and password. The simplest is to reuse the values from your local `.env`
   files; then the expired token you generate locally also works on EC2. You'll type them
   into `nano` on the instances, never into a command.

## 1. Launch four instances

In AWS Academy: **Start Lab**, then open the AWS console (region N. Virginia, us-east-1).
In **EC2 → Launch instances**, create four instances:

- Names: `equiphub-1-gateway`, `equiphub-2-auth`, `equiphub-3-equipment`, `equiphub-4-loan`
- AMI: **Ubuntu Server 26.04 LTS**, architecture **64-bit (x86)**
- Instance type: `t3.micro`
- Key pair: create one (for example `equiphub`) and keep the downloaded `.pem` file
- Network: the default VPC, with **Auto-assign public IP** enabled
- Security group: the matching group from step 2

For each instance, note its **Public IPv4 address** and **Private IPv4 address** (EC2 →
Instances → select the instance → Details).

## 2. Security groups

Create these four groups (**EC2 → Security Groups → Create security group**, in the default
VPC). Leave the outbound rules as they are (all traffic allowed); the instances need it to
reach Atlas and Docker Hub.

| Security group | Attach to | Inbound rules |
|---|---|---|
| `equiphub-gateway-sg` | EC2-1 | TCP 3000 from `0.0.0.0/0`; TCP 22 from My IP |
| `equiphub-auth-sg` | EC2-2 | TCP 3001 and TCP 3002 from `equiphub-gateway-sg`; TCP 22 from My IP |
| `equiphub-equipment-sg` | EC2-3 | TCP 8080 from `equiphub-gateway-sg` and from `equiphub-loan-sg`; TCP 22 from My IP |
| `equiphub-loan-sg` | EC2-4 | TCP 3004 from `equiphub-gateway-sg`; TCP 22 from My IP |

A rule whose source is another security group means: only instances in that group may
connect, and they connect through private IPs. That's what keeps the services unreachable
from the internet. (Create `equiphub-gateway-sg` and `equiphub-loan-sg` first, so the
others can refer to them.)

If you connect with **EC2 Instance Connect** in the browser instead of SSH from your Mac,
also allow TCP 22 from the prefix list `com.amazonaws.us-east-1.ec2-instance-connect`.
Instance Connect comes from AWS's addresses, not from your IP.

## 3. MongoDB Atlas network access

In Atlas: **Network Access → Add IP Address**, and add the **public** IPs of EC2-2, EC2-3 and
EC2-4 (each as a single address, `x.x.x.x/32`). EC2-1 never talks to the database.

Public IPs change whenever an instance stops and starts (for example when the lab session
ends), so update these entries after every restart.

## 4. On every instance: install Docker

Connect to the instance, with **EC2 Instance Connect** (Connect button in the console) or
from your Mac:

```bash
chmod 400 equiphub.pem
ssh -i equiphub.pem ubuntu@<PUBLIC-IP>
```

Update the system, then install Docker from Docker's official apt repository, exactly as in
the course (docs.docker.com/engine/install/ubuntu):

```bash
sudo apt update && sudo apt upgrade -y

# Add Docker's official GPG key
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update

# Install Docker Engine and the Compose plugin
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl status docker   # should say "active (running)"; press q to quit
sudo docker compose version    # Docker Compose v2
```

Use `docker compose` **with a space**. The slides show `docker-compose`, the old v1 tool,
which these packages don't install.

Then download the deploy files:

```bash
git clone https://github.com/vnak-1/equipment-lending-microservices.git
```

(If the repository is private, copy the instance's deploy folder over with `scp` instead.)

## 5. Start the services

Start them in this order, so each service finds the ones it depends on:
**EC2-2 and EC2-3 first, then EC2-4, then EC2-1.**

On every instance the steps are the same:

```bash
cd ~/equipment-lending-microservices/deploy/<folder>
nano .env                      # type this instance's lines (listed below) with real values
                               # save: Ctrl+O, Enter; quit: Ctrl+X
chmod 600 .env                 # only you can read it
sudo docker compose pull       # download the images from Docker Hub
sudo docker compose up -d      # start in the background (fine on EC2)
sudo docker compose ps         # every container should be "healthy" after about 30 s
sudo docker compose logs -f    # watch the logs; Ctrl+C stops watching (not the services)
```

In `.env`, write `KEY=value` with no quotes and no spaces around `=`. Avoid `$` in passwords
(Compose reads `$` as the start of a variable); if you must use one, write it as `$$`.

### EC2-2: registration + login (`deploy/ec2-2-auth`)

```
MONGO_URI=mongodb+srv://<db-user>:<db-password>@<cluster-host>/userdb
INTERNAL_KEY=<same value on every instance>
JWT_SECRET=<same value as on EC2-1>
JWT_EXPIRES_IN=24h
ADMIN_EMAIL=admin@aupp.edu.kh
ADMIN_PASSWORD=<the admin password>
```

In the logs, look for `Created the first admin` (only on the very first start) and
`listening on port 3001` / `3002`. Quick check on the instance:
`curl -s localhost:3001/health` returns `"status":"ok"`.

### EC2-3: equipment + nginx (`deploy/ec2-3-equipment`)

```
MONGO_URI=mongodb+srv://<db-user>:<db-password>@<cluster-host>/equipmentdb
INTERNAL_KEY=<same value on every instance>
```

Quick checks on the instance:

```bash
curl -s localhost:8080/nginx-health   # ok
curl -s localhost:8080/equipment      # 403 "Direct access is not allowed": nginx reached a replica
```

### EC2-4: loan (`deploy/ec2-4-loan`)

```
MONGO_URI=mongodb+srv://<db-user>:<db-password>@<cluster-host>/loandb
INTERNAL_KEY=<same value on every instance>
EQUIPMENT_PRIVATE_IP=<EC2-3 private IP>
```

Quick check: `curl -s localhost:3004/health` returns `"status":"ok"`.

### EC2-1: gateway (`deploy/ec2-1-gateway`)

```
JWT_SECRET=<same value as on EC2-2>
INTERNAL_KEY=<same value on every instance>
AUTH_PRIVATE_IP=<EC2-2 private IP>
EQUIPMENT_PRIVATE_IP=<EC2-3 private IP>
LOAN_PRIVATE_IP=<EC2-4 private IP>
```

Check from your Mac: `curl http://<EC2-1-PUBLIC-IP>:3000/health` returns `"status":"ok"`.

## 6. Test with Postman

1. Import `postman/EquipHub.postman_collection.json` and `postman/ec2.postman_environment.json`.
2. In the **EquipHub - EC2** environment, set `baseUrl` to `http://<EC2-1-PUBLIC-IP>:3000`,
   `adminPassword` to the admin password, and `expiredToken` to the output of
   `node scripts/make-expired-token.js` (generated with the same `JWT_SECRET` as EC2).
3. Run the folders in order. Request 5.12 (direct call to a service) is skipped on EC2: the
   security groups make the services unreachable from the internet, which is the point.

To see the load balancer at work, keep this running on EC2-3 while you send folder 4:

```bash
sudo docker compose logs -f equipment-1 equipment-2
```

## 7. After changing the code

On your Mac, push new images with the same tag: `./scripts/build-and-push.sh`. Then on each
instance that runs a changed service:

```bash
sudo docker compose pull && sudo docker compose up -d
```

The `pull` matters: the tag `v1.0` didn't change, so Docker won't fetch the new image unless
you ask it to.

## 8. When the lab restarts (AWS Academy)

The instances stop when the lab session ends. After **Start Lab**, start them again in the
EC2 console. The containers come back by themselves (`restart: unless-stopped`).
The public IPs are new, so:

- update Atlas Network Access with the new public IPs of EC2-2, EC2-3 and EC2-4
- update `baseUrl` in the Postman EC2 environment

The private IPs stay the same, so the `.env` files don't change.

## 9. Troubleshooting

| What you see | Check |
|---|---|
| SSH or Instance Connect can't connect, or Postman times out on EC2-1 | The security group (22, and 3000 on EC2-1). Then the VPC route table, as in the course's "EC2 Access Problem" slides: **VPC → Route tables →** the subnet's route table **→ Routes** must include `0.0.0.0/0 → igw-...`. If it's missing: **Edit routes → Add route**, destination `0.0.0.0/0`, target **Internet Gateway**, **Save changes**. Then **Subnet associations**: make sure the instance's subnet is associated with that route table. |
| A container keeps restarting; its logs say `exec format error` | The image was built for ARM. Run `./scripts/build-and-push.sh` (it builds for `linux/amd64`), then `sudo docker compose pull && sudo docker compose up -d`. |
| A container keeps restarting; its logs say `Failed to start` with a timeout | Atlas Network Access doesn't have this instance's public IP. |
| Postman gets 503 "Registration / Login / Equipment / Loan service unavailable" | On EC2-1: the private IP in `.env`. On the target instance: `sudo docker compose ps` shows it healthy, and its security group allows the port from `equiphub-gateway-sg`. |
| Borrowing gets 503 "Equipment service unavailable" | `EQUIPMENT_PRIVATE_IP` on EC2-4, and `equiphub-equipment-sg` allows 8080 from `equiphub-loan-sg`. |
| 403 "Direct access is not allowed" through the gateway | `INTERNAL_KEY` isn't the same on all four instances. |
| 401 "Invalid token" right after logging in | `JWT_SECRET` differs between EC2-1 and EC2-2. |
| `docker compose` says "required variable ... is missing a value" | That line is missing from `.env`. |
| The admin can't log in | `sudo docker compose logs registration-service` on EC2-2 should show `Created the first admin`. The admin is created only when no admin exists yet in `userdb.users`. |
