
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";



export const s3Client = new S3Client({ profile: 'learningNode', region: 'eu-north-1' })

export async function createUploadSignedURL({ key, contentType }) {
    const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 300, // seconds
        signableHeaders: new Set(['content-type'])
    });

    return signedUrl
}

export async function createGetSignedURL({ key, download, fileName }) {
    const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ResponseContentDisposition: `${download ? 'attachment' : 'inline'}; filename=${encodeURIComponent(fileName)}`
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 300, // seconds
    });
    return signedUrl
}

export async function getS3ObjectMetaData(key) {
    const command = new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
    })
    const metadata = await s3Client.send(command)

    return metadata
}

//delete object 
export async function deleteS3Object(key) {
    const command = new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
    })
    await s3Client.send(command)
}

//detete files at once
export async function deleteS3Objects(keys = []) {
    if (!Array.isArray(keys) || keys.length === 0) {
        return; // CRITICAL: avoid MalformedXML
    }

    const safeKeys = keys
        .filter(obj => obj?.Key && typeof obj.Key === "string");

    if (safeKeys.length === 0) {
        return;
    }

    const command = new DeleteObjectsCommand({
        Bucket: process.env.S3_BUCKET,
        Delete: {
            Objects: safeKeys,
            Quiet: false,
        },
    });

    await s3Client.send(command);
}