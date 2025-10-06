const express = require('express')
const userRoutes = require('./route/userRoutes')
const { getAvailableDB } = require("./util/check-db");
const setupLocalDB = require("./util/setup-localdb");


const app = express();



app.use('/user',userRoutes);


(async () => {
  const dbType = await getAvailableDB();

  if (dbType) {
    console.log(`✅ ${dbType.toUpperCase()} detected — setting up local setup DB...`);
    await setupLocalDB(dbType);
  } else {
    console.log("❌ No supported database (MySQL or PostgreSQL) is running.");
  }

  // Continue your main server initialization here...
})();   

app.listen(8080, () => {
    console.log("Application running on port 8080");
});