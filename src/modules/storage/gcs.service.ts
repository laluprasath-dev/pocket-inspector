import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import type { Readable, Writable } from 'stream';

export interface SignedUploadUrlOptions {
  objectPath: string;
  contentType: string;
  expirySeconds?: number;
}

export interface SignedDownloadUrlOptions {
  objectPath: string;
  expirySeconds?: number;
}

export interface SignedUrlWithExpiry {
  url: string;
  expiresAt: string; // ISO-8601 — client can parse directly, no GCS param parsing needed
}

@Injectable()
export class GcsService {
  private readonly logger = new Logger(GcsService.name);
  readonly storage: Storage;
  readonly bucketName: string;
  private readonly defaultExpirySeconds: number;
  private readonly serviceAccountEmail: string | undefined;

  constructor(private readonly configService: ConfigService) {
    const keyFilename = configService.get<string>(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );
    this.storage = new Storage({
      projectId: configService.getOrThrow<string>('GCS_PROJECT_ID'),
      ...(keyFilename ? { keyFilename } : {}),
    });
    this.bucketName = configService.getOrThrow<string>('GCS_BUCKET_NAME');
    this.defaultExpirySeconds = configService.get<number>(
      'GCS_SIGNED_URL_EXPIRY_SECONDS',
      900,
    );
    // Required on Cloud Run (ADC) so the library calls IAM signBlob instead of
    // looking for a private key. Grant roles/iam.serviceAccountTokenCreator on
    // itself to pocket-inspector-storage@<project>.iam.gserviceaccount.com.
    this.serviceAccountEmail = configService.get<string>(
      'GCS_SERVICE_ACCOUNT_EMAIL',
    );
  }

  async getSignedUploadUrl(opts: SignedUploadUrlOptions): Promise<string> {
    const expiry = opts.expirySeconds ?? this.defaultExpirySeconds;
    const [url] = await this.storage
      .bucket(this.bucketName)
      .file(opts.objectPath)
      .getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + expiry * 1000,
        contentType: opts.contentType,
        ...(this.serviceAccountEmail
          ? { serviceAccountEmail: this.serviceAccountEmail }
          : {}),
      });
    this.logger.debug(`Signed upload URL generated for: ${opts.objectPath}`);
    return url;
  }

  async getSignedDownloadUrl(opts: SignedDownloadUrlOptions): Promise<string> {
    return (await this.getSignedDownloadUrlWithExpiry(opts)).url;
  }

  async getSignedDownloadUrlWithExpiry(
    opts: SignedDownloadUrlOptions,
  ): Promise<SignedUrlWithExpiry> {
    const expiry = opts.expirySeconds ?? this.defaultExpirySeconds;
    const expiresAt = new Date(Date.now() + expiry * 1000);
    const [url] = await this.storage
      .bucket(this.bucketName)
      .file(opts.objectPath)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: expiresAt,
        ...(this.serviceAccountEmail
          ? { serviceAccountEmail: this.serviceAccountEmail }
          : {}),
      });
    return { url, expiresAt: expiresAt.toISOString() };
  }

  async deleteObject(objectPath: string): Promise<void> {
    await this.storage
      .bucket(this.bucketName)
      .file(objectPath)
      .delete({ ignoreNotFound: true });
    this.logger.debug(`Deleted GCS object: ${objectPath}`);
  }

  async objectExists(objectPath: string): Promise<boolean> {
    const [exists] = await this.storage
      .bucket(this.bucketName)
      .file(objectPath)
      .exists();
    return exists;
  }

  createReadStream(objectPath: string): Readable {
    return this.storage
      .bucket(this.bucketName)
      .file(objectPath)
      .createReadStream();
  }

  createWriteStream(
    objectPath: string,
    contentType = 'application/zip',
  ): Writable {
    return this.storage
      .bucket(this.bucketName)
      .file(objectPath)
      .createWriteStream({ contentType, resumable: false });
  }

  streamToGcs(
    objectPath: string,
    source: Readable,
    contentType = 'application/zip',
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const writeStream = this.createWriteStream(objectPath, contentType);
      source.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      source.on('error', reject);
    });
  }
}
