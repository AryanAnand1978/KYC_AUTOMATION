const fs = require("fs");
const axios = require("axios");

const apiKey = "AIzaSyCnhKZOXETL5UM3FEMSFXmbwxKVAxS7QNs";

const image = fs.readFileSync("C:/Users/Aryan Anand/OneDrive/Desktop/KYC/sample_aadhaar.png");
axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
        contents: [{
            parts: [
                {
                    text: "Extract all text from this image."
                },
                
                {
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: image.toString("base64")
                    }
                }
            ]
        }]
    }
)
    .then(r => {
        console.log(JSON.stringify(r.data, null, 2));
    })
    .catch(e => {
        console.log(JSON.stringify(e.response?.data, null, 2));
    });