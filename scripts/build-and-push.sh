#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

HUB_USER=vnak3
TAG=v1.0

build_and_push() {
  local image="$HUB_USER/$1:$TAG"
  echo
  echo "==> $image (from ./$2)"
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
