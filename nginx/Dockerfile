# Use the official Nginx image from Docker Hub
FROM nginx:latest

# Remove the default Nginx configuration file
RUN rm /etc/nginx/conf.d/default.conf

# Copy all custom configuration files from the conf.d directory
COPY conf.d/*.conf /etc/nginx/conf.d/

# Expose port 80 and 443
EXPOSE 80
EXPOSE 443

# Start Nginx when the container launches
CMD ["nginx", "-g", "daemon off;"]
