import { v2 as cloudinary } from 'cloudinary';

export const CloudinaryProvider = {
    provide: 'CLOUDINARY',
    useFactory: () => {

        console.log("Cloudinary cloud:", process.env.CLOUDINARY_CLOUD_NAME);
        console.log("Cloudinary key:", process.env.CLOUDINARY_API_KEY);
        console.log("Cloudinary secret:", process.env.CLOUDINARY_API_SECRET ? "loaded" : "missing");

        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        return cloudinary;
    },
};