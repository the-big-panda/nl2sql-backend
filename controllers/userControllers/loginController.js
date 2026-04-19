const { generateToken } = require("../../util/userAuth");
const { getAvailableDB } = require("../../util/check-db");
const pg_db = require("../../database/postgresConfig");
const { v4: uuidv4 } = require("uuid");

async function handleUserLogin(req, res) {
  const { useremail, userPassword } = req.body;
  try {
    if (!useremail || !userPassword) {
      return res.status(400).send("User Email and Password are Required");
    }

    // ✅ Query user by email
    const result = await pg_db.query(
      "SELECT * FROM userinfos WHERE useremail = $1",
      [useremail]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    // ✅ Check password (plain text for now; ideally use bcrypt)
    if (user.user_password !== userPassword) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Example token payload
    let token = generateToken({
      userID: user.user_id,
      userName: user.username,
    });

    // Set headers & cookie
    res.setHeader("Authorization", `Bearer ${token}`);
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });

    // Check database availability (utility function)
    getAvailableDB();

    return res.json({ token });
  } catch (error) {
    console.log("Login Error Occured", error);
    return res.status(500).send("Internal server error");
  }
}

async function handleUserRegistration(req, res) {
  try {
    const { username, useremail, userpassword } = req.body;

    if (!username || !useremail || !userpassword) {
      return res
        .status(400)
        .json({ error: "All Details are required" });
    }

    // ✅ Query user by email
    const result = await pg_db.query(
      "SELECT * FROM userinfos WHERE useremail = $1",
      [useremail]
    );

    if (result.rows.length != 0) {
      return res.status(404).json({ message: "User already exists" });
    }

    const user_id =  uuidv4();

    await pg_db.query(
     "INSERT INTO userinfos (user_id, username, useremail, user_password, \"createdAt\", \"updatedAt\") VALUES ($1, $2, $3, $4, NOW(), NOW())",
    [user_id, username, useremail, userpassword]
    );


    let token = generateToken({
      userID: user_id,
      userName: username,
    });

    // Set headers & cookie
    res.setHeader("Authorization", `Bearer ${token}`);
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });


    return res.status(201).json({
      message: "User registered successfully",
      token : token 
    });
  } catch (error) {
    console.log("Registration Error Occurred:", error);
    return res.status(500).send("Internal server error");
  }
}

module.exports = { handleUserLogin, handleUserRegistration };
