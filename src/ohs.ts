import {Logger} from "homebridge";
import fetch from 'node-fetch';
import {SubEvent} from 'sub-events';


export class OHSSensorState {
    constructor(public readonly name: string,
                public readonly alarming: boolean,
                public readonly note: string) {
    }
}

const MINIMUM_OK_TIME = 20;

function wait(timeout) {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
}

export class OHSClient {
    private seen: Set<string> = new Set<string>();

    public readonly onNewSensor: SubEvent<string> = new SubEvent();
    public readonly onDelSensor: SubEvent<string> = new SubEvent();
    public readonly onNewReading: SubEvent<OHSSensorState> = new SubEvent();

    private poller: NodeJS.Timer | null = null;

    private readonly auth: string;

    constructor(
        public readonly log: Logger,
        public readonly endpoint: string,
        username: string,
        password: string
    ) {
        this.log.debug('Connecting to:', this.endpoint);

        this.auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
    }


    start() {
        if (this.poller != null)
            return; // Cannot start twice

        this.poller = setInterval(this.poll.bind(this), 10000);
    }

    stop() {
        if (this.poller != null) {
            clearInterval(this.poller);

            this.poller = null;
        }
    }

    private async poll() {
        const states = await this.queryState(10);

        if (this.seen.size != states.length) {
            const cur = new Set<string>(states.map(s => s.name));

            // Emit notifications for removed sensors
            for (let name of this.seen) {
                if (!cur.has(name)) {
                    this.onDelSensor.emit(name);
                }
            }

            // Emit notifications for new sensors
            for (let name of cur) {
                if (!this.seen.has(name)) {
                    this.onNewSensor.emit(name);
                }
            }

            this.seen = cur;
        }

        // Emit all sensor readings
        for (let reading of states) {
            this.onNewReading.emit(reading);
        }
    }

    private async queryState(retries: number = 3, attempt: number = 0): Promise<OHSSensorState[]> {
        try {
            const response = await fetch(this.endpoint + '/z', {
                headers: {
                    'Authorization': this.auth,
                    'Connection': 'close'
                }
            })

            let html = await response.text();

            return OHSClient.parseState(html);
        } catch (e) {
            if (retries > 0) {
                await wait((attempt + 1) * 2000);

                return this.queryState(retries - 1, attempt + 1);
            } else {
                this.log.warn("Ran out of retries while querying OHS; failure was: ", e);
                throw e;
            }
        }
    }

    private static parseState(inputHTML: string) {
        const trElMatcher = /<.?tr>/gi;
        let tidied = inputHTML.split('\n').find(line => line.indexOf('body onload=') != -1);

        if (!tidied) throw new Error("Unable to find body onload= line!");

        let lines = tidied.replace(trElMatcher, '\n').split('\n').filter(line => line.indexOf('<td>') != -1);

        lines.length = Math.min(lines.length, 8);

        lines = lines
            .map(line => line
                .replace(/<i class=fa (fa-[a-z]+?).>/g, '$1')
                .replace(/fa-bell/g, 'ALARM')
                .replace(/fa-[a-z]+/g, '')
                .replace(/<td>(\d) - [a-z\d]+<\/td>/gi, '$1')
                .replace(/<[^>]+>/g, ' ')
                .replace(/(\d+)d, /g, '$1:')
                .replace(/ +/g, ' ')
                .replace(/^ (\d)+\.?/g, '$1')
                .replace(/ $/g, '')
                .replace(/ second\(s\)/gi, 's')
            );

        let fields = lines.map(line => line.split(' '));

        let ret: OHSSensorState[] = [];

        for (let line of fields) {
            const name = line[1];

            // Skip undefined sensors
            if (name == '-') continue;

            const zone = line[5];
            const lastOK = OHSClient.parseTime(line[6]);
            const lastAlarm = OHSClient.parseTime(line[7]) || 0;
            const isAlarming = (line.length > 8 && line[8] == 'ALARM');
            const isNotOkForSomeTime = lastOK == null || (lastOK < MINIMUM_OK_TIME);

            let isTriggered: boolean = false;
            let note: string;

            if (isAlarming) {
                isTriggered = true;
                note = 'Actively alarming';
            } else if (isNotOkForSomeTime) {
                isTriggered = true;
                note = 'OK for: ' + lastOK;
            } else {
                isTriggered = false;
                note = 'For ' + lastOK;
            }

            ret.push(new OHSSensorState(name, isTriggered, note));
        }

        return ret;
    }

    /**
     *
     * @param timeExpr Expected of form [days]:[hours]:[minutes]:[seconds]
     */
    private static parseTime(timeExpr: string): number | null {
        if (timeExpr == '-')
            return null;

        let totalSeconds = 0;

        const parts = timeExpr.split(':');
        const days = parseInt(parts[0]);
        const hours = parseInt(parts[1]);
        const minutes = parseInt(parts[2]);
        const seconds = parseInt(parts[3]);

        totalSeconds += (days * 24 * 60 * 60);
        totalSeconds += (hours * 60 * 60);
        totalSeconds += (minutes * 60);
        totalSeconds += seconds;

        return totalSeconds;
    }
}


