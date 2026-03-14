import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
    async uploadImage(
        file: Express.Multer.File,
        folder: string = 'products',
    ): Promise<UploadApiResponse> {
        if (!file?.buffer) {
            throw new InternalServerErrorException('Invalid file or missing buffer.');
        }

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    transformation: [
                        { width: 1000, crop: 'limit' },
                        { quality: 'auto' },
                        { fetch_format: 'auto' },
                    ],
                },
                (
                    error: UploadApiErrorResponse | undefined,
                    result: UploadApiResponse | undefined,
                ) => {
                    if (error) {
                        console.error('Cloudinary upload error:', error);
                        return reject(new InternalServerErrorException('Error uploading image'));
                    }
                    if (!result?.secure_url) {
                        return reject(new InternalServerErrorException('Upload failed - no URL returned'));
                    }
                    resolve(result);
                },
            );

            streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });
    }

    async deleteImage(publicId: string): Promise<void> {
        try {
            await cloudinary.uploader.destroy(publicId);
        } catch (error) {
            console.error('Cloudinary delete error:', error);
            // Don't throw - just log
        }
    }

    extractPublicIdFromUrl(url: string): string | null {
        const matches = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
        return matches ? matches[1] : null;
    }
}