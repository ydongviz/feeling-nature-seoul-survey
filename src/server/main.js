// Add an express server to save the result to the database.

const express = require('express');
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require('fs');
const {S3Client, ListObjectsV2Command, GetObjectCommand, ListObjectsCommand} = require("@aws-sdk/client-s3");
const {Upload} = require("@aws-sdk/lib-storage");
const dotenv = require('dotenv');


const app = express();
const port = 4060;

// Configure the environment
dotenv.config();
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

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.post('/api/survey', (req, res) => {
    // Echo the request body to the sender
    console.log(req.body);
    // Save the request body as a JSON file in local directory


    // Send back success message
    res.send({message: "Successfully received survey data."});
});


app.post('/api/contact', async (req, res) => {
    try {
        const _key = Object.keys(req.body)[0];
        const value = JSON.stringify(req.body[_key]);
        const key = `__contact_${_key}`;
        const params = {
            Bucket: AWS_BUCKET_NAME, Key: key, Body: value,
        };
        const uploader = new Upload({
            client: new S3Client({region: AWS_REGION, credentials: AWS_Credentials}), // replace with your AWS region
            params: params,
        });
        await uploader.done();
        console.log(`Uploaded or override ${key} successfully.`);
        res.status(200).send(key);
    } catch (error) {
        console.error(`Error uploading.`, error);
        res.status(500).send(`Internal Error Occurs`);
    }
});


app.post('/api/upload', async (req, res) => {
    try {
        // const {key, value} = req.body;
        const key = Object.keys(req.body)[0];
        const value = JSON.stringify(req.body[key]);
        const params = {
            Bucket: AWS_BUCKET_NAME, Key: key, Body: value,
        };
        const uploader = new Upload({
            client: new S3Client({region: AWS_REGION, credentials: AWS_Credentials}), // replace with your AWS region
            params: params,
        });
        await uploader.done();
        console.log(`Uploaded or override ${key} successfully.`);
        res.status(200).send(key);
    } catch (error) {
        console.error(`Error uploading.`, error);
        res.status(500).send(`Internal Error Occurs`);
    }
});


// Cache used for the S3 data
// Read from dump.json, if exists, to setup the object_cache
const object_cache = {};
if (fs.existsSync('./dump.json')) {
    fs.readFile('dump.json', (err, data) => {
        if (err) {
            console.error(`Error reading dump file to setup object_cache. Ignore..`, err);
        } else {
            console.log(`Dump file read successfully.`);
            Object.assign(object_cache, JSON.parse(data));
        }
    });
} else {
    console.log(`No dump file found. Ignore..`);
}


app.post('/api/data', async (req, res) => {
    try {
        // Fetch all keys from the bucket
        const params = {
            Bucket: AWS_BUCKET_NAME
        };
        const client = new S3Client({region: AWS_REGION, credentials: AWS_Credentials})
        const command = new ListObjectsV2Command(params);
        let isTruncated = true;

        let keys = [];

        while (isTruncated) {
            const {Contents, IsTruncated, NextContinuationToken} = await client.send(command);
            keys = keys.concat(Contents.map((c) => c.Key));
            isTruncated = IsTruncated;
            command.input.ContinuationToken = NextContinuationToken;
        }
        console.log(keys);

        // Fetch the data for each key, if not already in cache
        let promises_get_data = [];
        let promises_get_key = [];
        for (let key of keys) {
            if (!(key in object_cache)) {
                const params = {
                    Bucket: AWS_BUCKET_NAME, Key: key
                };
                const command = new GetObjectCommand(params);
                promises_get_data.push(client.send(command));
                promises_get_key.push(key);

            }
        }
        console.log(`Fetching new objects from S3: ${promises_get_data.length}`);
        const data = await Promise.all(promises_get_data);

        for (let i = 0; i < promises_get_key.length; i++) {
            const key = promises_get_key[i];
            const {Body} = data[i];
            // TODO: Read body from JSON string to object.
            //  Encounter a mysterious bug here.
            const body = await Body.transformToString();
            object_cache[key] = JSON.parse(body);
        }

        // Update the dump file to local.
        // Write to a file named "dump.{date}.json",
        // where {date} is the current datetime up to the second.

        const date = new Date().toISOString()
            .replace(/T/, ' ')
            .replace(/\..+/, '')
            .replace(/:/g, '-')
            .replace(/ /g, '_')
        ;
        const dump_file_name = `dump.${date}.json`;
        fs.writeFile(dump_file_name, JSON.stringify(object_cache), (err) => {
                if (err) {
                    console.error(`Error writing dump file.`, err);
                } else {
                    console.log(`Dump file written successfully: ${dump_file_name}`);

                    // Also write to dump.json
                    // TODO: Nested code debt.
                    fs.writeFile('dump.json', JSON.stringify(object_cache), (err) => {
                        if (err) {
                            console.error(`Error writing dump file.`, err);
                        } else {
                            console.log(`Dump file written successfully: dump.json`);
                        }
                    });
                }
            }
        );

        // Return the data for the requested keys
        res.status(200).send(object_cache);

    } catch (error) {
        console.error(`Error fetching data.`, error);
        res.status(500).send(`Internal Error Occurs`);

    }
});


app.get('/api/progress', async (req, res) => {
    // List all keys in the bucket.
    try {
        const params = {
            Bucket: AWS_BUCKET_NAME,
        };
        const s3 = new S3Client({region: AWS_REGION, credentials: AWS_Credentials});
        const response = await s3.send(new ListObjectsCommand(params));
        console.log(response);
        res.status(200).send(response);
    } catch (error) {
        console.error(`Error uploading.`, error);
        res.status(500).send(`Internal Error Occurs`);
    }
});

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});





