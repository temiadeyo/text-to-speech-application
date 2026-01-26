// ===============================
// Imports
// ===============================

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ===============================
// Clients
// ===============================

const pollyClient = new PollyClient({});
const s3Client = new S3Client({});

// ===============================
// Handler
// ===============================

export async function handler(event) {
  try {
    // -------------------------------
    // Normalize request body for API Gateway and Lambda tests
    // -------------------------------
    const body = typeof event.body === "string"
      ? JSON.parse(event.body)
      : event.body ?? event;

    const text = body.text;

    if (!text) {
      throw new Error("No text provided in request body");
    }

    // -------------------------------
    // Polly request parameters 
    // -------------------------------
    const pollyParams = {
      Text: text,
      OutputFormat: "mp3",
      VoiceId: "Joanna"
    };

    // -------------------------------
    // Synthesize speech with Polly
    // -------------------------------
    const synthesizeCommand = new SynthesizeSpeechCommand(pollyParams);
    const pollyResponse = await pollyClient.send(synthesizeCommand);

    if (!pollyResponse.AudioStream) {
      throw new Error("No audio stream returned from Polly");
    }

    // -------------------------------
    // Read Polly audio stream into a buffer
    // -------------------------------
    const audioBuffer = await streamToBuffer(pollyResponse.AudioStream);

    // -------------------------------
    // Upload audio file to S3
    // -------------------------------
    const key = `audio-${Date.now()}.mp3`;

    await s3Client.send(new PutObjectCommand({
		// 👇 Replace with your actual bucket name
      Bucket: "amzn-polly-audio-files-Storage",
      Key: key,
      Body: audioBuffer,
      ContentType: "audio/mpeg",
      ContentLength: audioBuffer.length // Set content length explicitly
    }));

    // -------------------------------
    // Generate a presigned URL
    // -------------------------------
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
		  // 👇 Replace with your actual bucket name
        Bucket: "amzn-polly-audio-files-Storage",
        Key: key
      }),
      { expiresIn: 300 } // 5 minutes
    );

    // -------------------------------
    // Return success response
    // -------------------------------
    return {
      statusCode: 200,
      headers: {
		  // 👇 Replace * with your frontend domain name in production
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ audioUrl: signedUrl })
    };

  } catch (error) {
    console.error("Lambda error:", error);

    return {
      statusCode: 500,
      headers: {
		  // 👇 Replace * with your frontend domain name in production
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        message: "Internal server error",
        error: error.message
      })
    };
  }
}

// ===============================
// Helpers
// ===============================

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}