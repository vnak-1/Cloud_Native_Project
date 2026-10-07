# Base image: nginx on Alpine (small and pinned)
FROM nginx:1.30.2-alpine

# Replace the default website config with our load balancer config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Document the port the load balancer listens on
EXPOSE 8080

# No CMD needed: the base image already starts nginx in the foreground
