import * as Comlink from 'comlink';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import { FaceDetectionResult } from '@/types';

let model: faceDetection.FaceDetector | null = null;

const api = {
    async initializeDetector() {
        // Load TensorFlow.js
        await tf.ready();

        // Create face detector
        const model = faceDetection.createDetector(
            faceDetection.SupportedModels.MediaPipeFaceDetector,
            {
                runtime: 'tfjs',
                modelType: 'short',
                maxFaces: 1 // We only need to track the main speaker
            }
        );

        return model !== null;
    },

    async detectFaces(imageData: ImageData, timestamp: number): Promise<FaceDetectionResult[]> {
        if (!model) {
            model = await faceDetection.createDetector(
                faceDetection.SupportedModels.MediaPipeFaceDetector,
                {
                    runtime: 'tfjs',
                    modelType: 'short',
                    maxFaces: 1
                }
            );
        }

        // Convert ImageData to tensor
        const tensor = tf.browser.fromPixels(imageData);

        // Detect faces
        const faces = await model.estimateFaces(tensor);
        tensor.dispose();

        // Format results
        return faces.map(face => ({
            timeStamp: timestamp,
            confidence: 0.9, // Default confidence value since API might have changed
            boundingBox: {
                xMin: face.box.xMin,
                yMin: face.box.yMin,
                width: face.box.width,
                height: face.box.height
            }
        }));
    }
};

Comlink.expose(api); 