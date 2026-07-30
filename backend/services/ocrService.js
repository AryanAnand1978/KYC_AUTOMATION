const fs = require('fs');
const path = require('path');
const axios = require('axios');

/*
  * Extracts Aadhaar number and Name from the given image path.
  * Uses Google Cloud Vision API or falls back to mock mode if MOCK_MODE is enabled.
 */

const extractAadhaarData = async (filePath) => {
  // 1. If Gemini API key is configured, use it for direct OCR & extraction
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'mock') {
    console.log('Running OCR using Google Gemini 2.5 Flash API.');
    try {
      const imageBuffer = fs.readFileSync(filePath);
      const base64Image = imageBuffer.toString('base64');
      const apiKey = process.env.GEMINI_API_KEY.trim(); // trim any accidental spaces

      // Detect actual MIME type from file extension
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

      // Use gemini-2.5-flash-latest - works with free AI Studio keys
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              {
                text: "Analyze the attached Aadhaar card image and extract: 1) The cardholder's Full Name (usually the uppercase line immediately above the DOB/Date of Birth line). 2) The 12-digit Aadhaar Number (format: XXXX XXXX XXXX). Return ONLY a JSON object formatted as {\"name\": \"...\", \"aadhaarNumber\": \"...\"}. Do not wrap it in markdown code blocks or add extra conversational words."
              },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Image
                }
              }
            ]
          }
        ]
      };

      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000
      });

      const resultText = response.data.candidates[0].content.parts[0].text;
      console.log("Gemini API OCR raw response:", resultText);

      const jsonString = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const extracted = JSON.parse(jsonString);

      return {
        name: (extracted.name || 'NOT DETECTED').toUpperCase(),
        aadhaarNumber: extracted.aadhaarNumber || 'NOT DETECTED',
        rawText: resultText
      };
    } catch (err) {
      // Log full API error response for easier debugging
      if (err.response) {
        console.error("Gemini API Error Status:", err.response.status);
        console.error("Gemini API Error Body:", JSON.stringify(err.response.data, null, 2));
      } else {
        console.error("Gemini OCR Service Error:", err.message);
      }
      throw new Error(`Gemini OCR analysis failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  // 2. Mock mode fallback if no keys or set to true
  if (process.env.MOCK_MODE === 'true' || !process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_VISION_API_KEY === 'mock') {
    console.log('Running OCR in MOCK MODE.');
    // Simulated mock OCR response
    return {
      name: "AARAV SHARMA",
      aadhaarNumber: "1234 5678 9012",
      rawText: "Government of India\nEnrollment No: 12345/67890/12345\nTo\nAARAV SHARMA\nDOB: 15/08/1995\nMale\n1234 5678 9012\nIndia"
    };
  }

  try {
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');

    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

    const requestBody = {
      requests: [
        {
          image: {
            content: base64Image
          },
          features: [
            {
              type: "TEXT_DETECTION"
            }
          ]
        }
      ]
    };

    const response = await axios.post(url, requestBody);
    const responses = response.data.responses;

    if (!responses || responses.length === 0 || !responses[0].textAnnotations || responses[0].textAnnotations.length === 0) {
      throw new Error("No text detected on the uploaded Aadhaar image.");
    }

    const fullText = responses[0].textAnnotations[0].description;
    console.log("OCR Raw Text:\n", fullText);

    // 1. Aadhaar Number Extraction
    // Aadhaar format: 12 digits, usually grouped as XXXX XXXX XXXX or XXXXXXXXXXXX
    const aadhaarRegex = /\b\d{4}\s\d{4}\s\d{4}\b/g;
    const simpleAadhaarRegex = /\b\d{12}\b/g;

    let aadhaarNumber = "";
    const matches = fullText.match(aadhaarRegex);
    if (matches && matches.length > 0) {
      aadhaarNumber = matches[0];
    } else {
      const simpleMatches = fullText.match(simpleAadhaarRegex);
      if (simpleMatches && simpleMatches.length > 0) {
        // Format as XXXX XXXX XXXX
        const rawNum = simpleMatches[0];
        aadhaarNumber = `${rawNum.slice(0, 4)} ${rawNum.slice(4, 8)} ${rawNum.slice(8, 12)}`;
      }
    }

    if (!aadhaarNumber) {
      // Try one more pattern if there are dashes or OCR read it weirdly
      const spacedRegex = /\b\d{4}-\d{4}-\d{4}\b/;
      const dashMatches = fullText.match(spacedRegex);
      if (dashMatches) {
        aadhaarNumber = dashMatches[0].replace(/-/g, ' ');
      }
    }

    // 2. Name Extraction Heuristics
    // Clean and split lines
    const lines = fullText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    let name = "";

    // Locate the line containing DOB (Date of Birth / Year of Birth)
    const dobKeywords = ["dob", "date of birth", "year of birth", "yob", "birth", "d.o.b", "d o b"];
    let dobIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const lowerLine = lines[i].toLowerCase();
      if (dobKeywords.some(keyword => lowerLine.includes(keyword)) || /\b\d{2}\/\d{2}\/\d{4}\b/.test(lowerLine)) {
        dobIndex = i;
        break;
      }
    }

    if (dobIndex > 0) {
      // Look at the lines directly above the DOB line
      // Often, the name is 1 or 2 lines above the DOB (skipping gender if it's placed weirdly)
      for (let j = dobIndex - 1; j >= 0; j--) {
        const candidateLine = lines[j];

        // Exclude lines that are obviously not names
        const upper = candidateLine.toUpperCase();
        if (
          upper.includes("GOVERNMENT OF INDIA") ||
          upper.includes("UNIQUE IDENTIFICATION") ||
          upper.includes("ENROLLMENT") ||
          upper.includes("FATHER") ||
          upper.includes("HUSBAND") ||
          upper.includes("TO") ||
          upper.includes("MALE") ||
          upper.includes("FEMALE") ||
          upper.includes("TRANSGENDER") ||
          /^\d+$/.test(candidateLine) // Skip lines containing only numbers
        ) {
          continue;
        }

        // Validate if it looks like an Indian name (primarily capital letters and spaces)
        // Names are typically alphabetic, possibly with dots or spaces
        if (/^[A-Za-z\s\.]+$/.test(candidateLine) && candidateLine.trim().split(/\s+/).length >= 2) {
          name = candidateLine.trim().toUpperCase();
          break;
        }
      }

      // If we couldn't find a matching line above DOB with letters-only, just take the line immediately above DOB
      if (!name) {
        let prevLine = lines[dobIndex - 1];
        // Strip out noise labels if present
        prevLine = prevLine.replace(/^(to|name|naam|नाम|श्री|श्रीमती)\b/gi, '').trim();
        name = prevLine.toUpperCase();
      }
    }

    // Backup Name strategy if no DOB is detected
    if (!name) {
      // Find lines that are all caps, have at least two words, and do not contain system keywords
      for (const line of lines) {
        const upperLine = line.toUpperCase();
        if (
          /^[A-Z\s]{3,30}$/.test(upperLine) &&
          upperLine.split(/\s+/).length >= 2 &&
          !upperLine.includes("GOVERNMENT") &&
          !upperLine.includes("INDIA") &&
          !upperLine.includes("MALE") &&
          !upperLine.includes("FEMALE")
        ) {
          name = upperLine;
          break;
        }
      }
    }

    // Default fallbacks if parsing failed
    if (!name) {
      name = "NOT DETECTED";
    }
    if (!aadhaarNumber) {
      aadhaarNumber = "NOT DETECTED";
    }

    return {
      name,
      aadhaarNumber,
      rawText: fullText
    };
  } catch (error) {
    console.error("Google Vision OCR Error:", error.message);
    throw new Error(`Aadhaar OCR processing failed: ${error.message}`);
  }
};

module.exports = {
  extractAadhaarData
};
