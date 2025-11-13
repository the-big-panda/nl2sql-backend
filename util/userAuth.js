const jwt = require("jsonwebtoken");
const { model } = require("mongoose");
require('dotenv').config();


const authenticateToken = (req,res,next) => {

    const token = req.header('Authorization')?.split(' ')[1];
    // if(!token) return res.status(401).send("Access Denied");
    try {
        const decodedBody = jwt.verify(token,process.env.ACCESS_TOKEN);
        console.log(`\n\n ${decodedBody.userID} \n`)
        req.user = decodedBody;
        next();
    } catch (error) {
        console.log('Authentication Error',error);
        res.status(500).send("Internal Server Error");
    }

} 

const generateToken = ({userID, userName}) => {
    const token = jwt.sign({userID,userName},process.env.ACCESS_TOKEN);
    return token;
}

module.exports = {authenticateToken,generateToken};