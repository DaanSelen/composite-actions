const fs = require('fs');
const os = require('os');
const core = require('@actions/core');
const path = require('path');

async function pullDockerImage(version) {
    await core.group(`Pull docker/scout-cli image`, async () => {
        await exec.exec(`docker pull docker.io/docker/scout-cli:${version}`);
    });
}

async function copyBinary(version) {
    await core.group(`Copy binary`, async () => {
        const res = await exec.getExecOutput('docker', ['create', `docker.io/docker/scout-cli:${version}`], {
        ignoreReturnCode: true
        });
        if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr);
        }
        const ctnid = res.stdout.trim();
        const dockerCfgPath = process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker');
        const pluginsPath = path.join(dockerCfgPath, 'cli-plugins');
        fs.mkdirSync(pluginsPath, { recursive: true });
        await exec.exec(`docker cp ${ctnid}:/docker-scout ${pluginsPath}`);
        await exec.exec(`docker rm -v ${ctnid}`);
    });
}

async function dockerInfo() {
    await core.group(`Docker info`, async () => {
        await exec.exec(`docker info`);
    });
}

async function getScoutVersion() {
    let version;
    await core.group(`Docker scout version`, async () => {
        const res = await exec.getExecOutput('docker', ['scout', 'version'], {
        ignoreReturnCode: true,
        silent: true
        });
        if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr);
        }
        const matchVersion = res.stdout.trim().match(/version:\s(.*?)\s/);
        version = matchVersion ? matchVersion[1] : null;
        if (!version) {
        throw new Error('Failed to get Docker scout version');
        }
        core.info(version);
    });
    return version;
}

async function runScoutCommand(commands, image, format, outputFile) {
    const resultPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'docker-scout-action-')), 'result.txt');
    core.setOutput('result-file', resultPath);

    for (const cmd of commands) {
        if (outputFile) {
            const res = await exec.getExecOutput('docker', ['scout', cmd, image, '--format', format], { silent: true });
            if (res.stderr && res.stderr.length > 0) {
                throw new Error(res.stderr);
            }

            fs.appendFile(resultPath, res.stdout);
        } else {
            await exec.exec('docker', ['scout', cmd, image, '--format', format]);
        }
    }
    return resultPath;
}

async function main(inputs) {
    try {
        const commandInput = core.getInput('command');
        const commands = commandInput.split(',').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
        const scoutVersion = core.getInput('version');
        const outputFormat = core.getInput('format');
        const imageName = core.getInput('image');
        const outputFile = core.getInput('output-file') === 'true';

        await pullDockerImage(scoutVersion);
        await copyBinary(scoutVersion);
        await dockerInfo();
        const version = await getScoutVersion();
        // TODO: cache binary (no changes per your request)
        await runScoutCommand(commands, imageName, outputFormat, outputFile);
    }
    catch (error) {
        core.setFailed(error.message);
        console.error(error);
    }
}
main()