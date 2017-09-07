import types = require("utils/types");
import * as imageSourceModule from "image-source";
import * as imageAssetModule from "image-asset";
import * as frameModule from "ui/frame";
import * as trace from "trace";
import * as fs from "file-system";

type VideoFormat = "default" | "mp4";

class UIImagePickerControllerDelegateImpl extends NSObject implements UIImagePickerControllerDelegate {
    public static ObjCProtocols = [UIImagePickerControllerDelegate];

    static new(): UIImagePickerControllerDelegateImpl {
        return <UIImagePickerControllerDelegateImpl>super.new();
    }

    private _callback: (result?) => void;

    private _width: number;
    private _height: number;
    private _keepAspectRatio: boolean;
    private _saveToGallery: boolean;
    private _saveToDocuments: boolean;
    private _saveInFolder: string;
    private _format: VideoFormat = "default";
	private _hd: boolean;

    public initWithCallback(callback: (result?) => void): UIImagePickerControllerDelegateImpl {
        this._callback = callback;
        return this;
    }

    public initWithCallbackAndOptions(callback: (result?) => void, options?): UIImagePickerControllerDelegateImpl {
        this._callback = callback;
        if (options) {
            this._width = options.width;
            this._height = options.height;
            this._saveToGallery = options.saveToGallery;
            this._saveToDocuments = options.saveToDocuments;
            this._saveInFolder = options.saveInFolder;
            this._keepAspectRatio = types.isNullOrUndefined(options.keepAspectRatio) ? true : options.keepAspectRatio;
            this._format = options.format;
            this._hd = options.hd;
        }
        return this;
    }

    // create date from a string with format yyyy:MM:dd HH:mm:ss (like the format used in image description)
    private createDateFromString(value: string): Date {
        let year = parseInt(value.substr(0, 4));
        let month = parseInt(value.substr(5, 2));
        let date = parseInt(value.substr(8, 2));

        let hour = parseInt(value.substr(11, 2));
        let minutes = parseInt(value.substr(14, 2));
        let seconds = parseInt(value.substr(17, 2));

        return new Date(year, month - 1, date, hour, minutes, seconds);
    }

    imagePickerControllerDidFinishPickingMediaWithInfo(picker, info): void {
        if (info) {

            let mediaType = info.valueForKey(UIImagePickerControllerMediaType);

            if (mediaType  == "public.image") {
                console.log("Image Selected")

                let currentDate: Date = new Date();
                let source = info.valueForKey(UIImagePickerControllerOriginalImage);
                if (source) {
                    let image = null;
                    let imageSource: typeof imageSourceModule = require("image-source");
                    let imageSourceResult = imageSource.fromNativeSource(source);
    
                    if (this._callback) {
                        let imageAsset: imageAssetModule.ImageAsset;
                        if (this._saveToGallery) {
                            PHPhotoLibrary.sharedPhotoLibrary().performChangesCompletionHandler(
                                () => {
                                    PHAssetChangeRequest.creationRequestForAssetFromImage(imageSourceResult.ios);
                                },
                                (success, err) => {
                                    if (success) {
                                        let fetchOptions = PHFetchOptions.alloc().init();
                                        let sortDescriptors = NSArray.arrayWithObject(NSSortDescriptor.sortDescriptorWithKeyAscending("creationDate", false));
                                        fetchOptions.sortDescriptors = sortDescriptors;
                                        fetchOptions.predicate = NSPredicate.predicateWithFormatArgumentArray("mediaType = %d", NSArray.arrayWithObject(PHAssetMediaType.Image));
                                        let fetchResult = PHAsset.fetchAssetsWithOptions(fetchOptions);
    
                                        if (fetchResult.count > 0) {
                                            // Take last picture
                                            let asset = <PHAsset>fetchResult[0];
    
                                            const dateDiff = asset.creationDate.valueOf() - currentDate.valueOf();
                                            if (Math.abs(dateDiff) > 1000) {
                                                // Image assets create date is rounded when asset is created. 
                                                // Display waring if the asset was created more than 1s before/after the current date.
                                                console.warn("Image asset returned was created more than 1 second ago");
                                            }
                                            imageAsset = new imageAssetModule.ImageAsset(asset);
                                            this.setImageAssetAndCallCallback(imageAsset);
                                        }
    
                                    } else {
                                        trace.write("An error ocurred while saving image to gallery: " + err, trace.categories.Error, trace.messageType.error);
                                    }
    
                                });
                        }
                        else {
                            imageAsset = new imageAssetModule.ImageAsset(imageSourceResult.ios);
                            this.setImageAssetAndCallCallback(imageAsset);
                        }
                    }
                }

            } else if (mediaType == "public.movie") {
                console.log("Video Selected")

                if (this._saveToGallery) {
                    console.log('will save video to gallery');

                    let source = info.objectForKey(UIImagePickerControllerMediaURL);
                    if (this._format === "mp4") {
                        console.log('will use format: mp4');

                        let asset = AVAsset.assetWithURL(source);
                        let preset = this._hd ? AVAssetExportPresetHighestQuality : AVAssetExportPresetLowQuality;
                        let session = AVAssetExportSession.exportSessionWithAssetPresetName(asset, preset);
                        session.outputFileType = AVFileTypeMPEG4;
                        let fileName = `videoCapture_${+new Date()}.mp4`;
                        let path = fs.path.join(fs.knownFolders.documents().path, fileName);
                        let savePath = path;
                        if (this._saveInFolder) {
                            let folder = fs.knownFolders.documents().getFolder(this._saveInFolder);
                            savePath = fs.path.join(folder.path, fileName);
                        }
                        let nativePath = NSURL.fileURLWithPath(path);
                        session.outputURL = nativePath;
                        session.exportAsynchronouslyWithCompletionHandler(() => {
                            let assetLibrary = ALAssetsLibrary.alloc().init();
                            assetLibrary.writeVideoAtPathToSavedPhotosAlbumCompletionBlock(nativePath, (file, error) => {
                                if (!error) {
                                    //this._callback(path);
                                    this.setVideoPathAndCallCallback(path);
                                }
                                if (!this._saveToDocuments) {
                                    fs.File.fromPath(path).remove();
                                }
                                
                            });
                        });
    
                    } else {
                        console.log('will use format: default');

                        let assetLibrary = ALAssetsLibrary.alloc().init();
                        assetLibrary.writeVideoAtPathToSavedPhotosAlbumCompletionBlock(source, (file, error) => {
                            if (!error) {
                                //this._callback();
                                this.setVideoPathAndCallCallback(source.path);
                            } else {
                                console.log(error.localizedDescription);
                            }
                            //fs.File.fromPath(source.path).remove();
                        });
                    }
                } else {
                    console.log('will NOT save video to gallery');

                    let source = info.objectForKey(UIImagePickerControllerMediaURL);
                    if (this._format === "mp4") {
                        console.log('will use format: mp4');

                        let asset = AVAsset.assetWithURL(source);
                        let preset = this._hd ? AVAssetExportPresetHighestQuality : AVAssetExportPresetLowQuality;
                        let session = AVAssetExportSession.exportSessionWithAssetPresetName(asset, preset);
                        session.outputFileType = AVFileTypeMPEG4;
                        let fileName = `videoCapture_${+new Date()}.mp4`;
                        let path = fs.path.join(fs.knownFolders.documents().path, fileName);
                        let nativePath = NSURL.fileURLWithPath(path);
                        session.outputURL = nativePath;
                        session.exportAsynchronouslyWithCompletionHandler(() => {
                            fs.File.fromPath(source.path).remove();
                            //this._callback({ file: path });
                            this.setVideoPathAndCallCallback(path);
                        });
                    } else {
                        console.log('will use format: default');

                        //this._callback({ file: source.path });
                        this.setVideoPathAndCallCallback(source.path);
                    }
                }
            }

            
        }
        picker.presentingViewController.dismissViewControllerAnimatedCompletion(true, null);
        listener = null;
    }

    private setImageAssetAndCallCallback(imageAsset: imageAssetModule.ImageAsset) {
        imageAsset.options = {
            width: this._width,
            height: this._height,
            keepAspectRatio: this._keepAspectRatio
        };
        this._callback(imageAsset);
    }

    private setVideoPathAndCallCallback(filePath: string) {
        // imageAsset.options = {
        //     width: this._width,
        //     height: this._height,
        //     keepAspectRatio: this._keepAspectRatio
        // };
        this._callback(filePath);
    }

    imagePickerControllerDidCancel(picker): void {
        picker.presentingViewController.dismissViewControllerAnimatedCompletion(true, null);
        listener = null;
    }
}

var listener;

export var takePicture = function (options): Promise<any> {

    console.log(JSON.stringify(options));

    return new Promise((resolve, reject) => {
        listener = null;
        let imagePickerController = UIImagePickerController.new();
        let reqWidth = 0;
        let reqHeight = 0;
        let keepAspectRatio = true;
        let saveToGallery = true;
        let format = "default";
        let hd = true;
        if (options) {
            reqWidth = options.width || 0;
            reqHeight = options.height || reqWidth;
            keepAspectRatio = types.isNullOrUndefined(options.keepAspectRatio) ? true : options.keepAspectRatio;
            saveToGallery = options.saveToGallery ? true : false;
            format = options.format;
            hd = options.hd;
        }

        let authStatus = PHPhotoLibrary.authorizationStatus();
        if (authStatus !== PHAuthorizationStatus.Authorized) {
            saveToGallery = false;
        }

        if (reqWidth && reqHeight) {
            listener = UIImagePickerControllerDelegateImpl.new().initWithCallbackAndOptions(resolve, { width: reqWidth, height: reqHeight, keepAspectRatio: keepAspectRatio, saveToGallery: saveToGallery, format: format, hd: hd });
        } else if (saveToGallery) {
            listener = UIImagePickerControllerDelegateImpl.new().initWithCallbackAndOptions(resolve, { saveToGallery: saveToGallery, keepAspectRatio: keepAspectRatio, format: format, hd: hd });
        }
        else {
            listener = UIImagePickerControllerDelegateImpl.new().initWithCallback(resolve);
        }
        imagePickerController.delegate = listener;

        let sourceType = UIImagePickerControllerSourceType.Camera;
        let mediaTypes = UIImagePickerController.availableMediaTypesForSourceType(sourceType);

        if (mediaTypes) {
            imagePickerController.mediaTypes = mediaTypes;
            imagePickerController.sourceType = sourceType;
        }

        imagePickerController.modalPresentationStyle = UIModalPresentationStyle.CurrentContext;

        let frame: typeof frameModule = require("ui/frame");

        let topMostFrame = frame.topmost();
        if (topMostFrame) {
            let viewController: UIViewController = topMostFrame.currentPage && topMostFrame.currentPage.ios;
            if (viewController) {
                viewController.presentViewControllerAnimatedCompletion(imagePickerController, true, null);
            }
        }
    });
}

export var isAvailable = function () {
    return UIImagePickerController.isSourceTypeAvailable(UIImagePickerControllerSourceType.Camera);
}

export var requestPermissions = function () {
    let authStatus = PHPhotoLibrary.authorizationStatus();
    if (authStatus === PHAuthorizationStatus.NotDetermined) {
        PHPhotoLibrary.requestAuthorization((auth) => {
            if (auth === PHAuthorizationStatus.Authorized) {
                if (trace.isEnabled()) {
                    trace.write("Application can access photo library assets.", trace.categories.Debug);
                }
                return;
            }
        })
    } else if (authStatus !== PHAuthorizationStatus.Authorized) {
        if (trace.isEnabled()) {
            trace.write("Application can not access photo library assets.", trace.categories.Debug);
        }
    }
}
