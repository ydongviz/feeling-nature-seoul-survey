import {Upload} from "@aws-sdk/lib-storage";
import {S3Client} from "@aws-sdk/client-s3";

const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    AWS_BUCKET_NAME
} = process.env;

const AWS_Credentials = {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
};

export default async function handler(req, res) {
    // Add comprehensive logging for debugging
    console.log('=== UPLOAD REQUEST DEBUG ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body type:', typeof req.body);
    console.log('Body value:', req.body);
    console.log('Body stringified:', JSON.stringify(req.body));
    console.log('Environment variables check:');
    console.log('- AWS_ACCESS_KEY_ID exists:', !!AWS_ACCESS_KEY_ID);
    console.log('- AWS_SECRET_ACCESS_KEY exists:', !!AWS_SECRET_ACCESS_KEY);
    console.log('- AWS_REGION:', AWS_REGION);
    console.log('- AWS_BUCKET_NAME:', AWS_BUCKET_NAME);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS preflight request');
        res.status(200).end();
        return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        console.log('Invalid method:', req.method);
        res.status(405).json({ 
            error: 'Method not allowed', 
            allowedMethods: ['POST'],
            receivedMethod: req.method 
        });
        return;
    }

    try {
        // Check environment variables first
        if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !AWS_BUCKET_NAME) {
            console.error('Missing AWS environment variables');
            res.status(500).json({ 
                error: 'Server configuration error - missing AWS credentials',
                missingVars: {
                    accessKey: !AWS_ACCESS_KEY_ID,
                    secretKey: !AWS_SECRET_ACCESS_KEY,
                    region: !AWS_REGION,
                    bucket: !AWS_BUCKET_NAME
                }
            });
            return;
        }

        // Enhanced request body validation with multiple fallback attempts
        let requestBody = req.body;
        
        console.log('=== BODY PARSING ATTEMPTS ===');
        console.log('Initial req.body:', requestBody);
        
        // Attempt 1: Check if body exists and is valid
        if (!requestBody) {
            console.log('req.body is null/undefined, checking alternatives...');
            
            // Attempt 2: Try to parse from raw body if available
            if (req.rawBody) {
                console.log('Found req.rawBody, attempting to parse...');
                try {
                    requestBody = JSON.parse(req.rawBody);
                    console.log('Successfully parsed rawBody:', requestBody);
                } catch (parseError) {
                    console.log('Failed to parse rawBody:', parseError.message);
                }
            }
            
            // Attempt 3: Check if it's a string that needs parsing
            if (typeof req.body === 'string') {
                console.log('req.body is string, attempting to parse...');
                try {
                    requestBody = JSON.parse(req.body);
                    console.log('Successfully parsed string body:', requestBody);
                } catch (parseError) {
                    console.log('Failed to parse string body:', parseError.message);
                }
            }
        }

        // Final validation
        if (!requestBody || typeof requestBody !== 'object') {
            console.error('Invalid or missing request body after all attempts');
            console.error('Final requestBody:', requestBody);
            console.error('Type:', typeof requestBody);
            
            res.status(400).json({ 
                error: 'Invalid request body',
                details: 'Request body must be a valid JSON object',
                received: {
                    type: typeof requestBody,
                    value: requestBody
                },
                debugInfo: {
                    originalBody: req.body,
                    rawBodyExists: !!req.rawBody,
                    contentType: req.headers['content-type']
                }
            });
            return;
        }

        // Get the survey key
        const bodyKeys = Object.keys(requestBody);
        console.log('Request body keys:', bodyKeys);
        
        if (bodyKeys.length === 0) {
            console.error('Request body is empty object');
            res.status(400).json({ 
                error: 'Empty request body',
                details: 'Request body must contain survey data'
            });
            return;
        }

        const key = bodyKeys[0];
        const finalKey = key.startsWith("raw/") ? key : `raw/${key}`;

        const surveyData = requestBody[key];
        
        console.log('=== SURVEY DATA ===');
        console.log('Survey key:', key);
        console.log('Survey data type:', typeof surveyData);
        console.log('Survey data:', surveyData);

        // Validate survey data
        if (!surveyData) {
            console.error('Survey data is null/undefined');
            res.status(400).json({ 
                error: 'Invalid survey data',
                details: 'Survey data cannot be null or undefined'
            });
            return;
        }

        // Prepare S3 upload
        const value = JSON.stringify(surveyData);
        const params = {
            Bucket: AWS_BUCKET_NAME,
            Key: finalKey,
            Body: value,
            ContentType: 'application/json',
            // Add metadata for debugging
            Metadata: {
                'upload-timestamp': new Date().toISOString(),
                'content-length': value.length.toString()
            }
        };

        console.log('=== S3 UPLOAD ATTEMPT ===');
        console.log('Bucket:', AWS_BUCKET_NAME);
        console.log('Key (original):', key);
        console.log('Key (final):', finalKey);
        console.log('Body length:', value.length);
        console.log('Region:', AWS_REGION);

        // Create S3 client with enhanced configuration
        const s3Client = new S3Client({
            region: AWS_REGION,
            credentials: AWS_Credentials,
            // Add request timeout and retry configuration
            requestHandler: {
                requestTimeout: 30000,
                httpsAgent: { timeout: 30000 }
            }
        });

        // Perform upload
        const uploader = new Upload({
            client: s3Client,
            params: params,
            // Add upload options
            queueSize: 4,
            partSize: 1024 * 1024 * 5, // 5MB
            leavePartsOnError: false
        });

        console.log('Starting S3 upload...');
        const uploadResult = await uploader.done();
        console.log('S3 upload completed successfully');
        console.log('Upload result:', uploadResult);

        // Success response
        res.status(200).json({ 
            success: true, 
            key: finalKey,
            uploadedAt: new Date().toISOString(),
            s3Location: uploadResult.Location,
            etag: uploadResult.ETag
        });

    } catch (error) {
        console.error('=== UPLOAD ERROR ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Error stack:', error.stack);
        
        // AWS specific error handling
        if (error.name === 'AccessDenied' || error.Code === 'AccessDenied') {
            console.error('AWS Access Denied - check IAM permissions');
            console.error('Required S3 permissions: s3:PutObject, s3:PutObjectAcl');
            console.error('Bucket:', AWS_BUCKET_NAME);
            console.error('User ARN from error:', error.message);
        }

        if (error.$metadata) {
            console.error('AWS Error Metadata:', error.$metadata);
        }

        // Detailed error response
        res.status(500).json({ 
            error: 'Upload failed',
            details: error.message,
            errorType: error.constructor.name,
            errorCode: error.code || error.Code,
            timestamp: new Date().toISOString(),
            // Include AWS specific error details if available
            awsError: error.$metadata ? {
                httpStatusCode: error.$metadata.httpStatusCode,
                requestId: error.$metadata.requestId,
                attempts: error.$metadata.attempts
            } : null
        });
    }
}