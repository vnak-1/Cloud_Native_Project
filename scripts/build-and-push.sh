#!/usr/bin/env bash
# Builds every EquipHub image for EC2 and pushes it to Docker Hub as vnak3/<name>:v1.0.
# EC2 runs Linux on x86 ("linux/amd64") but this Mac is ARM, so --platform tells Docker to
# build x86 images. Run it yourself, after "docker login":
#   ./scripts/build-and-push.sh
set -euo pipefail
cd "$(dirname "$0")/.." # the repo root

HUB_USER=vnak3
TAG=v1.0

# build_and_push <image name> <folder with its Dockerfile>
build_and_push() {
  local image="$HUB_USER/$1:$TAG"
  echo
  echo "==> $image (from ./$2)"
  # buildx builds for the given platform, and --push uploads the result to Docker Hub
  docker buildx build --platform linux/amd64 --tag "$image" --push "./$2"
}

build_and_push gateway gateway
build_and_push registration-service registration-service
build_and_push login-service login-service
build_and_push equipment-service equipment-service
build_and_push loan-service loan-service
build_and_push equipment-lb nginx

echo
echo "All six images are on Docker Hub."
echo "On each EC2 instance, in its deploy folder: sudo docker compose pull && sudo docker compose up -d"
echo "Locally, keep using 'docker compose up --build' so you run images built for your Mac."
