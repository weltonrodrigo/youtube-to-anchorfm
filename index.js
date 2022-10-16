const { exec } = require('child_process');
const fs = require('fs');

function GetEnvironmentVar(varname, defaultvalue) {
    var result = process.env[varname];
    if (result != undefined)
        return result;
    else
        return defaultvalue;
}
require('dotenv').config()
const email = process.env.ANCHOR_EMAIL;
const password = process.env.ANCHOR_PASSWORD;
const UPLOAD_TIMEOUT = process.env.UPLOAD_TIMEOUT || 60 * 5 * 1000;

const YT_URL = 'https://www.youtube.com/watch?v=';

// default episode config is episode.json
const episodeConfigFileName = GetEnvironmentVar('EPISODE_CONFIG','episode.json')
// allow running index.js directly on local machine. just EPISODE_PATH=./
const episodeConfigPath = GetEnvironmentVar('EPISODE_PATH','/github/workspace/')
const pathToEpisodeJSON = `${episodeConfigPath}${episodeConfigFileName}`
const outputFile = 'episode.mp3';


// Just save as draft, to allow approval flow.
const draftMode = GetEnvironmentVar('SAVE_AS_DRAFT', 'false')
const actionText = draftMode == 'true' ? 'Save as draft' : 'Publish now'

// Allow fine tunning of the converted audio file
// Example: "ffmpeg:-ac 1" for mono mp3
const postprocessorArgs = GetEnvironmentVar('POSTPROCESSOR_ARGS', "")
const postprocessorArgsCmd = postprocessorArgs == ""? "": `--postprocessor-args="${postprocessorArgs}"`

const youtubedl = require('youtube-dl');
const puppeteer = require('puppeteer');

try {
    const epConfJSON = JSON.parse(fs.readFileSync(pathToEpisodeJSON, 'utf-8'));

    const YT_ID = epConfJSON.id;
    console.log(`Processing: ${YT_ID}`);
    const url = YT_URL + YT_ID;

    youtubedl.getInfo(url, function (err, info) {
        if (err) throw err;
        epConfJSON.title = info.title;
        epConfJSON.description = info.description;

        console.log(`title: ${epConfJSON.title}`)
        console.log(`description: ${epConfJSON.description}`)

        const youtubeDlCommand = `youtube-dl -o ${outputFile} -f bestaudio -x --restrict-filenames --force-overwrites --audio-format mp3 ${postprocessorArgsCmd} ${url}`;
        console.log(`Download command: ${youtubeDlCommand}`)

        exec(youtubeDlCommand, (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`)
                return
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`)
                return
            }
            console.log(`stdout: ${stdout}`)
            fs.writeFileSync(pathToEpisodeJSON, JSON.stringify(epConfJSON));

            const episode = JSON.parse(fs.readFileSync(pathToEpisodeJSON, 'utf-8'));
            const jsonEpisode = JSON.stringify(episode)
            console.log(`-- Episode config file: ${jsonEpisode}`);

            (async () => {
                console.log("Launching puppeteer");
                const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: true });
                const page = await browser.newPage();

                // Force english
                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'en'
                });

                const navigationPromise = page.waitForNavigation();

                await page.goto('https://anchor.fm/dashboard/episode/new');

                await page.setViewport({ width: 1600, height: 789 });

                await navigationPromise;

                console.log("Trying to log in");
                await page.type('#email', email);
                await page.type('#password', password);
                await page.click('button[type=submit]');
                await navigationPromise;
                console.log("Logged in");

                await page.waitForSelector('input[type=file]');
                console.log("Uploading audio file");
                const inputFile = await page.$('input[type=file]');
                await inputFile.uploadFile(outputFile);

                try {
                    console.log("Waiting for upload to finish");
                    await page.waitForTimeout(25 * 1000);
                    await page.waitForXPath('//button[not(boolean(@disabled))]/*[text()="Save episode"]', { timeout: UPLOAD_TIMEOUT });
                    const [saveButton] = await page.$x('//button[not(boolean(@disabled))]/*[text()="Save episode"]');
                    await saveButton.click();
                    await navigationPromise;
    
                    console.log("-- Adding title");
                    await page.waitForSelector('#title', { visible: true });
                    // Wait some time so any field refresh doesn't mess up with our input
                    await page.waitForTimeout(2000);
                    await page.type('#title', episode.title);
    
                    console.log("-- Adding description");
                    await page.waitForSelector('div[role="textbox"]', { visible: true });
                    await page.type('div[role="textbox"]', episode.description);
    
                    console.log("-- Publishing");
                    const [button] = await page.$x(`//*[text()="${actionText}"]`);
    
                    // If no button is found using label, try using css path
                    if (button) {
                        await button.click();
                    }
                    else {
                        await page.click('.styles__button___2oNPe.styles__purple___2u-0h.css-39f635');
                    }
                } catch (err) {
                    console.log("Error uploading:" + err);
                    console.log("Will try to save a screenshot");
		    await page.screenshot({path: "error.png"});
                }

                await navigationPromise;
                await browser.close()

                return new Promise((resolve, reject) => resolve("yay"));
            })().then(r => console.log(r), v => console.log(v));
        });
    });

} catch (error) {
    throw error;
}
