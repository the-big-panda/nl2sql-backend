// setup-localdb.js
const { Sequelize, DataTypes } = require("sequelize");
const os = require("os");

let db; // ✅ Declare db at module level so it’s accessible for export

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
  db = new Sequelize(
    localDBName,
    dbType === "mysql" ? "root" : "postgres",
    "",
    {
      host: "localhost",
      dialect: dbType,
      logging: false,
    }
  );

  // 4️⃣ Define UserInfo model
  const UserInfo = db.define("userinfo", {
    user_id: {
      type: DataTypes.TEXT,
      unique: true,
      allowNull: false,
      primaryKey: true,
      
    },
    username: { type: DataTypes.STRING, allowNull: false },
    useremail: { type: DataTypes.STRING, allowNull: false, unique: true },
    user_password: { type: DataTypes.STRING, allowNull: false },
  });

  const databaseInfo = db.define("dbinfo", {
    user_id: {
      type: DataTypes.TEXT,
      allowNull: false,
      references: {
        model: "userinfos", // 👈 must match the actual table name
        key: "user_id", // 👈 foreign key refers to this column
      },
      onDelete: "CASCADE", // optional: delete dbinfo if user deleted
      onUpdate: "CASCADE",
    },
    db_service: { type: DataTypes.TEXT, allowNull: false },
    db_user: { type: DataTypes.TEXT, allowNull: false },
    db_password: { type: DataTypes.TEXT, allowNull: false },
  });

  // 5️⃣ Sync model (creates table if not exists)
  await db.sync();

  // 6️⃣ Check if already initialized
  const count = await UserInfo.count();
  if (count === 0) {
    await UserInfo.create({
      user_id: "local_user_1",
      username: os.userInfo().username,
      useremail: `${os.userInfo().username}@local.dev`,
      user_password: "password123",
    });
    console.log("✅ Inserted initial local setup info.");
  } else {
    console.log("✅ Local setup info already exists.");
  }

  return db; // ✅ Return it for usage if needed
}

module.exports = { setupLocalDB, db };
