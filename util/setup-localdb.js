// setup-localdb.js
const { Sequelize, DataTypes } = require("sequelize");
const os = require("os");

async function setupLocalDB(dbType) {
  if (!dbType) {
    console.log("❌ No database available for setup.");
    return;
  }

  const localDBName = "local_setup_db";
  let sequelize;

  // 1️⃣ Connect to the base server (no DB yet)
  if (dbType === "mysql") {
    sequelize = new Sequelize("mysql", "root", "", {
      host: "localhost",
      dialect: "mysql",
      logging: false,
    });
  } else if (dbType === "postgres") {
    sequelize = new Sequelize("postgres", "postgres", "", {
      host: "localhost",
      dialect: "postgres",
      logging: false,
    });
  }

  // 2️⃣ Create the DB if it doesn’t exist
  try {
    await sequelize.query(`CREATE DATABASE ${localDBName};`);
    console.log(`✅ Created ${localDBName} database`);
  } catch (err) {
    if (err.message.includes("already exists")) {
      console.log("✅ Database already exists");
    } else {
      console.log("⚠️", err.message);
    }
  } finally {
    await sequelize.close();
  }

  // 3️⃣ Connect to the actual local_setup_db
  const db = new Sequelize(localDBName, dbType === "mysql" ? "root" : "postgres", "", {
    host: "localhost",
    dialect: dbType,
    logging: false,
  });

  // 4️⃣ Define UserInfo model
  const UserInfo = db.define("UserInfo", {
    username: { type: DataTypes.STRING, allowNull: false },
    machine_name: { type: DataTypes.STRING, allowNull: false },
  });

  // 5️⃣ Sync model (creates table if not exists)
  await db.sync();

  // 6️⃣ Check if already initialized
  const count = await UserInfo.count();
  if (count === 0) {
    await UserInfo.create({
      username: os.userInfo().username,
      machine_name: os.hostname(),
    });
    console.log("✅ Inserted initial local setup info.");
  } else {
    console.log("✅ Local setup info already exists.");
  }

  await db.close();
}

module.exports = setupLocalDB;
