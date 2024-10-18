const { ipcRenderer, clipboard } = require('electron');

const urlTextBox = document.getElementById('urlTextBox');
const outputTextBox = document.getElementById('outputTextBox');
const downloadButton = document.getElementById('downloadButton');
const formatSelection = document.getElementById('formatSelection');
const thumbnailPreview = document.getElementById('thumbnailPreview');

let formatSelectionEnabled = false;
let downloadInProgess = false;

function getUrlFromTextBox(){
    let url = "";

    url = urlTextBox.value;

    if (url == "" || url == undefined) return;

    if (!url.includes("youtube.com") && !url.includes("youtu.be")){
        writeOutput("ERROR: Unsupported URL!", true);
    }
    else {
        ipcRenderer.send('startDownload', {
            url: url
        });
    }
}

function writeOutput(value, overwrite = false){
    if (value == "" || value == undefined) return;

    if (!overwrite) outputTextBox.value += `\n${value}`
    else outputTextBox.value = value;

    outputTextBox.scrollTop = outputTextBox.scrollHeight; 
}

function replaceOutput(value){
    if (value == "" || value == undefined) return;

    const outputTextBoxText_old = outputTextBox.value;

    let outputTextBoxText_new = outputTextBoxText_old.split('\n');
    outputTextBoxText_new[outputTextBoxText_new.length - 1] = value;
    outputTextBoxText_new = outputTextBoxText_new.join('\n');

    outputTextBox.value = outputTextBoxText_new;
    outputTextBox.scrollTop = outputTextBox.scrollHeight; 
}

function fillFormatSelection(availableFormatOptions){
    if(availableFormatOptions == undefined) return;

    availableFormatOptions = availableFormatOptions.reverse();

    for (let i = 0; i < availableFormatOptions.length; i++){
        const format = availableFormatOptions[i];

        if (format.resolution != undefined && format.fps != undefined && format.tbr != undefined && format.filesize != undefined && format.format_id != undefined){
            const format_id = format.format_id;
            const resolution = format.resolution;
            const fps = format.fps;
            const tbr = format.tbr;
            let filesize = format.filesize;
            let sufix = "b";

            if (filesize == undefined || filesize <= 0) return console.log("ERROR: Invalid file size");

            if (filesize > 1000) {
                filesize = parseFloat(filesize / 1000).toFixed(2); // Kb
            sufix = "Kb";
            }
            if (filesize > 1000) {
                filesize = parseFloat(filesize / 1000).toFixed(2); // Mb
                sufix = "Mb";
            }
            if (filesize > 1000) {
                filesize = parseFloat(filesize / 1000).toFixed(2); // Gb
                sufix = "Gb";
            }

            formatSelection.innerHTML += `
            <span id="${format_id}" class="format-container" onclick="submitFormatChoice(${format_id})">
                <span class="format-content no-outline">${resolution}p ${fps}fps (${tbr}kbps) - ${filesize}${sufix}</span>
            </span>
            `;
        }

    }

    writeOutput("Please select a video quality...", true);

    formatSelectionEnabled = true;
}

function clearFormatSelection(){
    formatSelection.innerHTML = '';
}

function submitFormatChoice(format_id){
    if (!formatSelectionEnabled) return;
    if (format_id == undefined) return console.log("ERROR: Invalid format choice");

    formatSelectionEnabled = false;
    clearFormatSelection();

    ipcRenderer.send('submitFormatChoice', {
        format_id: format_id
    });
    console.log(`Submitted format '${format_id}'`);
}

urlTextBox.addEventListener('keypress', function (e) {
    if (e.keyCode === 13 || e.which === 13) {
        e.preventDefault();
        if (!downloadInProgess) getUrlFromTextBox();
        return false;
    }
});

urlTextBox.addEventListener('contextmenu', function (e) {
    e.preventDefault();

    const text = clipboard.readText().replaceAll(/(\r\n|\n|\r)/gm, ' ');
    if (text == undefined || text == "") return;

    urlTextBox.value = `${text}`;
})

downloadButton.addEventListener('click', function(e) { 
    if (!downloadInProgess) getUrlFromTextBox();
    //else ipcRenderer.send('cancelDownload', undefined);
});

ipcRenderer.on('writeOutput', (event, arg) => {
    const value = arg.value;
    const overwrite = arg.overwrite;

    if (value == undefined || overwrite == undefined) return console.log("ERROR: Incorrect values for 'value' or 'overwrite'");

    writeOutput(value, overwrite);
})

ipcRenderer.on('replaceOutput', (event, arg) => {
    const value = arg.value;

    if (value == undefined) return console.log("ERROR: Incorrect values for 'value'");

    replaceOutput(value);
})

ipcRenderer.on('fillFormatSelection', (event, arg) => {
    const availableFormatOptions = arg;
    if(availableFormatOptions == undefined) return;

    fillFormatSelection(availableFormatOptions);
})

ipcRenderer.on('setThumbnailPreview', (event, arg) => {
    const imagePath = arg.replaceAll('#', '%23').replaceAll('+', '%2B');
    if(imagePath == undefined || imagePath == "") return;

    thumbnailPreview.src = imagePath;
    thumbnailPreview.classList.remove('thumbnailPreview-hidden');
})

ipcRenderer.on('hideThumbnailPreview', (event, arg) => {
    thumbnailPreview.classList.add('thumbnailPreview-hidden');
    thumbnailPreview.src = null;
})

ipcRenderer.on('updateDownloadStatus', (event, arg) => {
    if (arg == undefined || arg.value == undefined) return;
    const status = arg.value;

    if (status) {
        downloadInProgess = true;

        downloadButton.classList.add('downloadButton-disable');
        ipcRenderer.send('setMenuState', false);
        //downloadButton.innerHTML = "Cancel";
    }
    else {
        downloadInProgess = false;

        downloadButton.classList.remove('downloadButton-disable');
        ipcRenderer.send('setMenuState', true);
        urlTextBox.value = '';
        //downloadButton.innerHTML = "Download";
    }
})