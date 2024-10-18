const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, exec } = require('child_process');
const { channel } = require('diagnostics_channel');

let ytdlpPath = './yt-dlp.exe';
let ffmpegPath = './ffmpeg.exe';
let mogrifyPath = './mogrify.exe';

let config;
let downloadDirPath =  './downloads/'

let win;
let url;
let tempDirName = "temp";
let pathNameTemplate = "./temp/%(title)s.%(ext)s";
let formats; 
let filename;
let parsedVideoBitrate;
let videoInfo;
let availableFormatOptions;
let selectedFormat;

let child;

function writeOutput(value, overwrite = false){
    win.webContents.send('writeOutput', {value: value, overwrite: overwrite});
    console.log(`OUTPUT WRITE: "${value}"`);
}

function replaceOutput(value){
    win.webContents.send('replaceOutput', {value: value});
    console.log(`OUTPUT REPLACE: "${value}"`);
}

function downloadMetadata(){
    if (url == "" || url == undefined) return console.log("ERROR: URL is not defined");

    child = execFile(ytdlpPath, [url, '-o', `temp/${tempDirName}/%(title)s`, '--skip-download', '--no-playlist', '--write-info-json', '--write-thumbnail'], (error, stdout, stderr) => {
        if (error) {
          throw error;
        }

        //console.log(stdout);
        readInfoFile();
    });
}

function readInfoFile(){
    let tempDir_filesList;
    try{
        tempDir_filesList = fs.readdirSync(path.resolve(`./temp/${tempDirName}/`), 'utf8');
    } catch{
        return console.log("ERROR: Unable to read temp file directory");
    }

    if (tempDir_filesList == undefined) return console.log("ERROR: Unable to find metadata file");

    let infoJson;

    let infoJsonFilePath;
    for (let i = 0; i < tempDir_filesList.length; i++){
        if (tempDir_filesList[i].endsWith('.info.json')) {
            infoJsonFilePath = path.resolve(`./temp/${tempDirName}/${tempDir_filesList[i]}`);
            filename = tempDir_filesList[i];
            filename = filename.substr(0, filename.length - 10);
        }
    }

    if (infoJsonFilePath == undefined) return console.log("ERROR: Unable to find metadata file");

    try{
        infoJson = JSON.parse(fs.readFileSync(infoJsonFilePath));
    } catch{
        return console.log("ERROR: Unable to read info JSON file");
    }

    if (infoJson == undefined) return console.log("ERROR: Unable to read info JSON file");

    if (infoJson.id == undefined) return console.log("ERROR: Invalid video ID JSON data");
    videoInfo = { videoId: infoJson.id, title: infoJson.title, channel: infoJson.channel, timestamp: infoJson.timestamp, description: infoJson.description, url: `https://youtu.be/${infoJson.id}` }
    
    if (infoJson.formats == undefined) {
        writeOutput('\nERROR: Invalid video URL!', true);
        return console.log("ERROR: Invalid formats JSON data");
    }
    formats = infoJson.formats;

    infoJson = undefined;

    parseVideoQualities();
}

function parseVideoQualities(){
    availableFormatOptions = []; 
    for (let i = 0; i < formats.length; i++){ // Loop through all parsed format
        const format = formats[i];

        /*if (!format.vcodec.includes('avc1')) {} // Filter for H.264 codec
        else*/ if (format.format_id && format.filesize && format.height && format.resolution && format.fps && format.tbr && format.video_ext) {
            const quality = `${format.height}p${format.fps}`;

            let disallowPush = false;
            for (let j = 0; j < availableFormatOptions.length; j++){ // Check if a format of the same quality exists
                const selectedFormatOption = availableFormatOptions[j];

                if (selectedFormatOption.quality == quality){ 
                    const tbr = parseFloat(format.tbr)

                    if (selectedFormatOption.tbr < tbr) { // If existing format of same quality has worse bitrate, remove it
                        availableFormatOptions.splice(j, 1);
                    }
                    else disallowPush = true;
                }
            }

            if (!disallowPush) availableFormatOptions.push({
                format_id: format.format_id,
                filesize: format.filesize,
                height: format.height,
                resolution: format.resolution,
                fps: format.fps,
                tbr: parseFloat(format.tbr),
                video_ext: format.video_ext,
                quality: `${format.height}p${format.fps}`,
                vcodec: format.vcodec
            });
        }
    }

    let imagePath;

    if (fs.existsSync(`./temp/${tempDirName}/${filename}.jpg`)) imagePath = path.resolve(`./temp/${tempDirName}/${filename}.jpg`);
    if (fs.existsSync(`./temp/${tempDirName}/${filename}.webp`)) imagePath = path.resolve(`./temp/${tempDirName}/${filename}.webp`);

    if (imagePath != undefined) win.webContents.send('setThumbnailPreview', imagePath);

    if (!config.autoBestQuality) win.webContents.send('fillFormatSelection', availableFormatOptions);
    else {
        selectedFormat = availableFormatOptions[availableFormatOptions.length - 1];
        if (selectedFormat == undefined) return console.log("ERROR: Invalid format option");
        
        selectedFormatId = selectedFormat.format_id;

        pathNameTemplate = `./temp/${tempDirName}/%(title)s.%(ext)s`;

        writeOutput('Starting download...', true);
        writeOutput(`Download folder path: ${downloadDirPath}`);
        writeOutput(`Video quality: ${selectedFormat.quality}fps`);
        writeOutput(' ');
        processThumbnail();
    }
} 

function processThumbnail(){
    writeOutput(`Processing thumbnail...`);

    if (fs.existsSync(`./temp/${tempDirName}/${filename}.webp`)){
        child = execFile(mogrifyPath, ['-format', 'jpg', `./temp/${tempDirName}/*.webp`], (error, stdout, stderr) => {
            if (error) {
                throw error;
            }

            try{
                fs.unlinkSync(`./temp/${tempDirName}/${filename}.webp`);
            } catch {}

            if (fs.existsSync(`./temp/${tempDirName}/${filename}.jpg`)){
                writeOutput('Thumbnail processing complete!');
                writeOutput(' ');
        
                downloadVideo();
            }
            else{
                writeOutput('Thumbnail processing complete!');
                writeOutput(' ');
        
                downloadVideo();
            }
        });
    }
    else if (fs.existsSync(`./temp/${tempDirName}/${filename}.jpg`)){
        writeOutput('Thumbnail processing complete!');
        writeOutput(' ');

        downloadVideo();
    }
    else{
        writeOutput('Thumbnail processing complete!');
        writeOutput(' ');

        downloadVideo();
    }
}

function downloadVideo(){
    writeOutput(`Downloading video...`);
    writeOutput(' ');

    const args = [url, '-f', `${selectedFormat.format_id}+bestaudio`, '-o', pathNameTemplate, '--merge-output-format', 'mp4', '--recode-video', 'mp4', '--audio-quality', '0', '--no-playlist', '-R', '10', '--add-metadata', '--embed-chapters', '--sub-langs', 'all', '--embed-subs', '--progress', '-q'];

    child = execFile(ytdlpPath, args, (error, stdout, stderr) => {
        if (error) {
          throw error;
        }

        replaceOutput('Video download complete!');
        writeOutput(' ');

        if (config.recodeVideos) { readBitrate(); } // Needed for recode
        else embedMetadata();
    });

    child.stdout.on('data', function(data) {
        //console.log(`stdout: ${data.toString()}`);
        if (data == undefined || data.toString() == "") return;
        if (data.toLowerCase().includes('unknown')) return;

        let output = data.toString();
        output = output.substr(data.lastIndexOf(']') + 1).trimStart();
        output = output.trimStart().trimEnd();
        output = output.replaceAll(/(\r\n|\n|\r)/gm, '');
        output = '  ' + output;

        replaceOutput(output);
    });
}

function readBitrate(){
    if (!fs.existsSync(`./temp/${tempDirName}/${filename}.mp4`)) return recodeVideo();;

    const args = ['-i', `./temp/${tempDirName}/${filename}.mp4`];

    child = execFile(ffmpegPath, args, (error, stdout, stderr) => {
        if (error) {
            // throw error;
        }

        if (error == undefined) return recodeVideo();
        
        const lines = error.toString().split(/(\r\n|\n|\r)/gm);
        let bitrateLine;

        for (let i = 0; i < lines.length; i++){
            console.log(lines[i]);
            if (lines[i].toLowerCase().includes('bitrate')) bitrateLine = lines[i]; 
        }

        if (bitrateLine == undefined) return recodeVideo();
        bitrateLine = bitrateLine.toLowerCase();
        bitrateLine = bitrateLine.substr(bitrateLine.indexOf('bitrate') + 8);
        bitrateLine = bitrateLine.match(/(\d+)/)[0];

        parsedVideoBitrate = parseInt(bitrateLine);

        recodeVideo();
    });
}

function recodeVideo(encoder = 0, retry = false){
    if (selectedFormat.vcodec.includes('avc1')) {
        writeOutput('Skipping recoding (video codec is already H.264)...');
        writeOutput(' ');

        return embedMetadata();
    }

    let tempDir_filesList = fs.readdirSync(path.resolve(`./temp/${tempDirName}/`), 'utf8');

    if (!fs.existsSync(`./temp/${tempDirName}/${filename}.mp4`)) writeOutput("\nERROR: Unable to download video");

    let vcodec = 'libx264';
    switch (encoder){
        case 0:
            vcodec = 'h264_nvenc';
            break;
        case 1:
            vcodec = 'h264_amf';
            break;
        case 2:
            vcodec = 'h264_mf';
            break;
        case 3:
            vcodec = 'h264_qsv';
            break;
        default: 
            vcodec = 'libx264';
            break;
    }

    if (!retry) writeOutput('Recoding video...');
    else writeOutput(`Attempting recode with '${vcodec}' instead...`);
    writeOutput(' ');

    const threads = (os.cpus() != undefined && !isNaN(os.cpus().length)) ? os.cpus().length : 1;
    const bitrate = (parsedVideoBitrate != undefined && !isNaN(parsedVideoBitrate)) ? `${parsedVideoBitrate * 1.1625}k` : `${Math.round(selectedFormat.tbr * 1.3)}k`;
    if (parsedVideoBitrate != undefined && !isNaN(parsedVideoBitrate)) replaceOutput('Using file native bitrate...');

    const args = ['-i', `./temp/${tempDirName}/${filename}.mp4`, '-c:v', vcodec, '-c:a', 'aac', '-preset', 'slow', '-crf', '20', '-threads', threads, '-b:v', bitrate, '-c:s', 'mov_text', '-map', '0', `./temp/${tempDirName}/${filename}-recoded.mp4`, '-y', '-progress', 'pipe:1'];

    try{
        child = execFile(ffmpegPath, args, (error, stdout, stderr) => {
            if (error) {
            throw error;
            }
    
            if (fs.existsSync(`./temp/${tempDirName}/${filename}-recoded.mp4`)){
                try{
                    fs.unlinkSync(`./temp/${tempDirName}/${filename}.mp4`);
                } catch {}
                try{
                    fs.renameSync(`./temp/${tempDirName}/${filename}-recoded.mp4`, `./temp/${tempDirName}/${filename}.mp4`);
                } catch {}
        
                replaceOutput('Video Recoding complete!');
                writeOutput(' ');
        
                embedMetadata();
            }
            else{
                if (encoder + 1 <= 3) {
                    replaceOutput(`Unable to encode video with '${vcodec}'`);
                    return recodeVideo(encoder + 1, true);
                }
                else{
                    writeOutput('WARNING: Video recoding failed');
                    writeOutput(' ');
            
                    return embedMetadata();
                }
            }
        });

        child.stdout.on('data', function(data) {
            if (data == undefined || data.toString() == "") return;
    
            let output = data.toString();
            output = output.trimStart().trimEnd();
            output_array = output.split(/(\r\n|\n|\r)/gm);

            let temp = []
            for (let i = 0; i < output_array.length; i++){
                if (output_array[i] != '\n') temp[temp.length] = output_array[i];
            }
            output_array = temp;

            output = `${output_array[0]} ${output_array[1]} ${output_array[3]} ${output_array[4]} ${output_array[7]} ${output_array[10]}`;
            output = '  ' + output;
    
            replaceOutput(output);
        });
    } catch{
        if (encoder + 1 <= 3) {
            replaceOutput(`Unable to encode video with '${vcodec}'`);
            return recodeVideo(encoder + 1, true);
        }
        else{
            writeOutput('WARNING: Video recoding failed');
            writeOutput(' ');
    
            return embedMetadata();
        }
    }
}   

function embedMetadata(){
    writeOutput('Attaching metadata...');

    const description = `${videoInfo.description.replaceAll(`"`, `''`)}\n\n${videoInfo.url}`;
    const uploaderName = videoInfo.channel;
    const uploadDate = parseUploadDateString(videoInfo.timestamp);

    isShort = false;
    if (config.skipShortsThumbnailEmbed){
        const resolution = selectedFormat.resolution;
        const videoWidth = parseInt(resolution.toLowerCase().split('x')[0]);
        const videoHeight = parseInt(resolution.toLowerCase().split('x')[1]);

        if (isNaN(videoWidth) || isNaN(videoHeight)) console.log("ERROR: Invalid resolution");
        else if (videoWidth < videoHeight) isShort = true;
    }

    let args;
    if (!config.embedThumbnail || (config.skipShortsThumbnailEmbed && isShort)) {
        writeOutput('Skipping thumbnail embedding...');
        args = ['-i', `./temp/${tempDirName}/${filename}.mp4`, '-c', 'copy', '-metadata',  `comment=${description}`, '-metadata', `author=${uploaderName}`, '-metadata', `creation_time=${uploadDate}`, `./temp/${tempDirName}/${filename}-temp.mp4`, '-y'];
    }
    else args = ['-i', `./temp/${tempDirName}/${filename}.mp4`, '-i', `./temp/${tempDirName}/${filename}.jpg`, '-map', '1', '-map', '0', '-c', 'copy', '-disposition:0', 'attached_pic', '-metadata',  `comment=${description}`, '-metadata', `author=${uploaderName}`, '-metadata', `creation_time=${uploadDate}`, `./temp/${tempDirName}/${filename}-temp.mp4`, '-y'];

    child = execFile(ffmpegPath, args, (error, stdout, stderr) => {
        if (error) {
            throw error;
        }

        try{
            fs.unlinkSync(`./temp/${tempDirName}/${filename}.mp4`);
        } catch {}
        try{
            fs.renameSync(`./temp/${tempDirName}/${filename}-temp.mp4`, `./temp/${tempDirName}/${filename}.mp4`);
        } catch {}

        writeOutput('Metadata attachment complete!');
        writeOutput(' ');

        moveToDownloadsDirectory();
    });
}

function moveToDownloadsDirectory(){
    writeOutput('Moving video to downloads directory...');

    if (!fs.existsSync(downloadDirPath)) {
        try{
            fs.mkdirSync(downloadDirPath);
        } catch {}
    };

    try{
        fs.rmSync(`${downloadDirPath}/${filename}.mp4`);
    } catch{}

    if (process.platform === "win32") {
        exec(`move "${path.resolve(`./temp/${tempDirName}/${filename}.mp4`)}" "${path.normalize(`${downloadDirPath}/${filename}.mp4`)}"`, (error, stdout, stderr) => {
            finish();
        });
    }
    else if (process.platform === "linux") {
        exec(`mv "${path.resolve(`./temp/${tempDirName}/${filename}.mp4`)}" "${path.normalize(`${downloadDirPath}/${filename}.mp4`)}"`, (error, stdout, stderr) => {
            finish();
        });
    }
    else finish();
}

function finish(){
    if (!fs.existsSync(path.normalize(`${downloadDirPath}/${filename}.mp4`))) {
        writeOutput('WARNING: Unable to move video to download directory');
        writeOutput('Attempting to move video to default downloads directory...');

        fs.renameSync(`./temp/${tempDirName}/${filename}.mp4`, `./downloads/${filename}.mp4`);
    }

    writeOutput('Cleaning up...');

    if (!fs.existsSync(path.normalize(`${downloadDirPath}/${filename}.mp4`)) && !fs.existsSync(`./downloads/${filename}.mp4`)) writeOutput('WARNING: Unable to move video from \'./temp/\' folder');

    try{
        if (fs.existsSync(path.normalize(`${downloadDirPath}/${filename}.mp4`) || fs.existsSync(`./downloads/${filename}.mp4`))) fs.rmSync(path.resolve(`./temp/${tempDirName}`), { recursive: true });
    } catch {}

    writeOutput(' ');
    writeOutput('Download complete!');

    updateDownloadStatus(false);

    if (config.writeHistory) writeDownloadLog();
}

function writeDownloadLog(){
    const date = Date.now();

    const log = `${parseUploadDateString(date / 1000)} | "${videoInfo.title}" | ${url}\n`;
    try{
        if (!fs.existsSync(path.resolve('./log/'))) fs.mkdirSync(path.resolve('./log/'));
        fs.appendFileSync(path.resolve('./log/download-history.txt'), log);
    } catch {}
}

function updateDownloadStatus(value){
    if (value == undefined) return;

    win.webContents.send('updateDownloadStatus', {value: value});
}

function resetDefaults(){
    win = undefined;
    url = undefined;
    tempDirName = "temp";
    pathNameTemplate = "./temp/%(title)s.%(ext)s";
    formats = undefined; 
    filename = undefined;
    videoInfo = undefined;
    parsedVideoBitrate = undefined;
    availableFormatOptions = undefined;
    selectedFormat = undefined;
}

function parseUploadDateString(timestamp){
    if (timestamp == undefined || isNaN(timestamp) || timestamp < 0) return console.log("ERROR: Invalid upload date timestamp");

    const uploadDate = new Date(timestamp * 1000);

    const uploadYear = uploadDate.getUTCFullYear();
    const uploadMonth = uploadDate.getUTCMonth() + 1;
    const uploadDay = uploadDate.getUTCDate();
    const uploadHour = uploadDate.getUTCHours();
    const uploadMinute = uploadDate.getUTCMinutes();
    const uploadSecond = uploadDate.getUTCSeconds();

    const uploadDateString = `${uploadYear}-${uploadMonth}-${uploadDay} ${uploadHour}:${uploadMinute}:${uploadSecond}`;

    return uploadDateString;
}

module.exports = {
    startDownload(win_local, options){
        if (win_local == undefined) return console.log("ERROR: Window object not defined");
        if (options == undefined || options.url == undefined || options.config == undefined) return console.log("ERROR: Options object not defined");

        resetDefaults();
        win = win_local;
        url = options.url;
        config = options.config;

        updateDownloadStatus(true);

        if (config.ytdlpPath == undefined) return writeOutput('ERROR: \'yt-dlp.exe\' binary not found');
        if (config.ffmpegPath == undefined) return writeOutput('ERROR: \'ffmpeg.exe\' binary not found');
        if (config.mogrifyPath == undefined) return writeOutput('ERROR: \'mogrify.exe\' binary not found');
        ytdlpPath = path.resolve(config.ytdlpPath);
        ffmpegPath = path.resolve(config.ffmpegPath);
        mogrifyPath = path.resolve(config.mogrifyPath);
        if (!fs.existsSync(ytdlpPath)) { writeOutput('ERROR: \'yt-dlp.exe\' binary not found'); return updateDownloadStatus(false)};
        if (!fs.existsSync(ffmpegPath)) { writeOutput('ERROR: \'ffmpeg.exe\' binary not found'); return updateDownloadStatus(false)};
        if (!fs.existsSync(mogrifyPath)) { writeOutput('ERROR: \'mogrify.exe\' binary not found'); return updateDownloadStatus(false)};

        downloadDirPath = config.downloadDirPath;

        tempDirName = `${Date.now()}`;
        if (!fs.existsSync(path.resolve(`./temp/`))) fs.mkdirSync(path.resolve('./temp/'))
        fs.mkdirSync(path.resolve(`./temp/${tempDirName}`));

        win.webContents.send('hideThumbnailPreview', undefined); 
    
        writeOutput('Loading available video qualities...', true);
        downloadMetadata();
    },

    submitFormatChoice(arg){
        if (arg == undefined || arg.format_id == undefined || isNaN(arg.format_id)) return console.log("ERROR: Invalid format option submitted");
        selectedFormatId = arg.format_id;

        for (let i = 0; i < availableFormatOptions.length; i++){
            if (availableFormatOptions[i].format_id == selectedFormatId) selectedFormat = availableFormatOptions[i];
        }

        if (selectedFormat == undefined) return console.log("ERROR: Invalid format option");

        pathNameTemplate = `./temp/${tempDirName}/%(title)s.%(ext)s`;

        writeOutput('Starting download...', true);
        writeOutput(`Download folder path: '${downloadDirPath}'`);
        writeOutput(`Video quality: ${selectedFormat.quality}fps`);
        writeOutput(' ');
    
        processThumbnail();
    },

    cancelDownload(callback){
        resetDefaults();

        try{
            win.webContents.send('hideThumbnailPreview', undefined); 
        } catch {}

        child.kill();

        return callback();
    },

    clearTempDir(){
        if (!fs.existsSync(path.resolve('./temp/'))) return;

        const tempDir_list = fs.readdirSync(path.resolve('./temp/'), 'utf8');

        tempDir_list.forEach(fileSystemEntry => {
            try{
                fs.rmSync(path.resolve(`./temp/${fileSystemEntry}`));
            } catch {}
            try{
                fs.rmSync(path.resolve(`./temp/${fileSystemEntry}`), { recursive: true });
            } catch {}
        });

        console.log("Temp directory cleared");
    }
}