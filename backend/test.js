const path = require("path");
const fs = require("fs");
const axios = require("axios");

// Load environment variables from backend/.env
require("dotenv").config({ path: path.join(__dirname, ".env") });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey === "mock") {
    console.error("Error: GEMINI_API_KEY is not set or is 'mock' in backend/.env");
    process.exit(1);
}

const sampleImagePath = path.join(__dirname, "..", "sample_aadhaar.png");
if (!fs.existsSync(sampleImagePath)) {
    console.error(`Error: Sample image not found at ${sampleImagePath}`);
    process.exit(1);
}

const image = fs.readFileSync(sampleImagePath);

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
                        mimeType: "image/png",
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