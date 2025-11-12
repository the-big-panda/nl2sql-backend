const express = require('express')
const userRoutes = require('./route/userRoutes')
const { getAvailableDB } = require("./util/check-db");
const { setupLocalDB } = require('./util/setup-localdb');
var cors = require('cors')


const app = express();

// ✅ Middleware to parse JSON bodies
app.use(express.json());

// (optional but common) to handle URL-encoded forms
app.use(express.urlencoded({ extended: true }));

var corsOptions = {
  origin: 'http://localhost:8000',
  //optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
 
app.use(cors(corsOptions));

app.use('/user',userRoutes);


(async () => {
  const dbType = await getAvailableDB();

  if (dbType) {
    console.log(`✅ ${dbType.toUpperCase()} detected — setting up local setup DB...`);
    await setupLocalDB(dbType);
  } else {
    console.log("❌ No supported database (MySQL or PostgreSQL) is running.");
  }

  const db = await setupLocalDB("postgres"); // initialize db
  app.set("db", db); // store in app context

  // Continue your main server initialization here...
})();   

app.listen(8080, () => {
    console.log("Application running on port 8080");
});