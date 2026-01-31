# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install any needed packages
RUN npm install

# Bundle app source
COPY . .

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Run the app when the container launches
CMD ["node", "server.js"]

# You should replace "server.js" with the actual entry point of your application.
# You should also create a simple "server.js" file in the same directory as this Dockerfile.
# For example:
#
# const http = require('http');
#
# const server = http.createServer((req, res) => {
#   res.statusCode = 200;
#   res.setHeader('Content-Type', 'text/plain');
#   res.end('Hello, World!\n');
# });
#
# const port = process.env.PORT || 3000;
# server.listen(port, () => {
#   console.log(`Server running at http://localhost:${port}/`);
# });
