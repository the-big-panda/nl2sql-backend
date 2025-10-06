
const { generateToken } = require("../../util/userAuth");
const {checkDB} = require("../../util/check-db");



async function handleUserLogin(req,res) {
    
    try {

        console.log("User login successful");
        let token = generateToken({userID : 101, userName : 'Yuvraj'});
        res.setHeader('Authorization',`Bearer ${token}`);
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
        checkDB();
        return res.json(token);

        //return res.status(200).send("Login success");

        
    } catch (error) {
        console.log("Login Error Occured",error);
        return res.status(500).send('Internal server error');
    }

}

module.exports = {handleUserLogin};