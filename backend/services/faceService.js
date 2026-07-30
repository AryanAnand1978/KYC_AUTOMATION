const fs = require('fs');
const axios = require('axios');
const Jimp = require('jimp');
const FormData = require('form-data');

const FACEPP_DETECT_URL = 'https://api-us.faceplusplus.com/facepp/v3/detect';
const FACEPP_COMPARE_URL = 'https://api-us.faceplusplus.com/facepp/v3/compare';

/**
 * Detects face in Aadhaar image using Face++ and crops the region.
 * Saves the cropped face to outputFacePath.
 */
const detectAndCropFace = async (imagePath, outputFacePath) => {
  if (process.env.MOCK_MODE === 'true' || !process.env.FACEPLUSPLUS_API_KEY || process.env.FACEPLUSPLUS_API_KEY === 'mock') {
    console.log('Running Face Detection in MOCK MODE.');
    
    try {
      // Simulate face cropping by cropping the center region of the uploaded image
      const image = await Jimp.read(imagePath);
      const width = image.bitmap.width;
      const height = image.bitmap.height;

      // Crop center 40% of the image as mock face
      const cropWidth = Math.floor(width * 0.4);
      const cropHeight = Math.floor(height * 0.4);
      const cropX = Math.floor((width - cropWidth) / 2);
      const cropY = Math.floor((height - cropHeight) / 3); // Slightly higher than center

      await image.crop(cropX, cropY, cropWidth, cropHeight);
      await image.writeAsync(outputFacePath);
      console.log('Mock face cropped successfully.');
      return;
    } catch (err) {
      console.error('Error during Mock Face cropping:', err.message);
      throw new Error(`Mock face detection and cropping failed: ${err.message}`);
    }
  }

  try {
    const apiKey = process.env.FACEPLUSPLUS_API_KEY;
    const apiSecret = process.env.FACEPLUSPLUS_API_SECRET;

    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('api_secret', apiSecret);
    form.append('image_file', fs.createReadStream(imagePath));
    form.append('return_landmark', '0');

    console.log('Sending request to Face++ Detect API...');
    const response = await axios.post(FACEPP_DETECT_URL, form, {
      headers: form.getHeaders(),
      timeout: 15000
    });

    const faces = response.data.faces;
    if (!faces || faces.length === 0) {
      throw new Error('No face detected in the uploaded Aadhaar image. Please upload a clear photo.');
    }

    // Get bounding box of the first detected face
    const { top, left, width, height } = faces[0].face_rectangle;
    console.log(`Face detected at: Left:${left}, Top:${top}, W:${width}, H:${height}`);

    // Crop using Jimp
    const image = await Jimp.read(imagePath);
    
    // Add a bit of padding around the face for better verification results (Face++ recommendation)
    const paddingX = Math.floor(width * 0.1);
    const paddingY = Math.floor(height * 0.1);
    
    const cropX = Math.max(0, left - paddingX);
    const cropY = Math.max(0, top - paddingY);
    const cropW = Math.min(image.bitmap.width - cropX, width + (paddingX * 2));
    const cropH = Math.min(image.bitmap.height - cropY, height + (paddingY * 2));

    await image.crop(cropX, cropY, cropW, cropH);
    await image.writeAsync(outputFacePath);
    console.log('Face cropped and saved successfully.');
  } catch (error) {
    console.error('Face++ Detection Error:', error.response ? error.response.data : error.message);
    throw new Error(`Face++ detection failed: ${error.response?.data?.error_message || error.message}`);
  }
};

/**
 * Compares Aadhaar face image with user live selfie image using Face++.
 * Returns a confidence score between 0 and 100.
 */
const compareFaces = async (facePath, selfiePath) => {
  if (process.env.MOCK_MODE === 'true' || !process.env.FACEPLUSPLUS_API_KEY || process.env.FACEPLUSPLUS_API_KEY === 'mock') {
    console.log('Running Face Comparison in MOCK MODE.');
    
    // We can simulate a successful score (e.g. 92.5)
    // To allow testing of failure, let's look at the selfie file name. If it contains "fail", return 45.0
    if (selfiePath.toLowerCase().includes('fail')) {
      return 45.0;
    }
    return 92.5;
  }

  try {
    const apiKey = process.env.FACEPLUSPLUS_API_KEY;
    const apiSecret = process.env.FACEPLUSPLUS_API_SECRET;

    const form = new FormData();
    form.append('api_key', apiKey);
    form.append('api_secret', apiSecret);
    form.append('image_file1', fs.createReadStream(facePath));
    form.append('image_file2', fs.createReadStream(selfiePath));

    console.log('Sending request to Face++ Compare API...');
    const response = await axios.post(FACEPP_COMPARE_URL, form, {
      headers: form.getHeaders(),
      timeout: 20000
    });

    const confidence = response.data.confidence;
    console.log(`Face++ comparison confidence: ${confidence}%`);
    return confidence;
  } catch (error) {
    console.error('Face++ Comparison Error:', error.response ? error.response.data : error.message);
    throw new Error(`Face++ comparison failed: ${error.response?.data?.error_message || error.message}`);
  }
};

module.exports = {
  detectAndCropFace,
  compareFaces
};
