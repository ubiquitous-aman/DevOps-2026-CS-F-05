# frontend/Dockerfile
FROM nginx:alpine

# Copy the Nginx config FIRST (so it exists even if later steps fail)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Clear default Nginx static content
RUN rm -rf /usr/share/nginx/html/*

# Copy only the frontend source files (NOT Dockerfile, NOT nginx.conf, NOT test/)
COPY index.html *.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY images/ /usr/share/nginx/html/images/
COPY admin/ /usr/share/nginx/html/admin/
COPY company/ /usr/share/nginx/html/company/
COPY student/ /usr/share/nginx/html/student/
COPY tpo/ /usr/share/nginx/html/tpo/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
