import { connect } from 'node:net';
import { describe, expect, it } from 'vitest';
import { parseClamdResponse } from './malware-scanner';

const configured = Boolean(process.env.CLAMAV_INTEGRATION_HOST);
const describeIntegration = configured ? describe : describe.skip;

async function scan(bytes: Uint8Array): Promise<ReturnType<typeof parseClamdResponse>> {
  const host = process.env.CLAMAV_INTEGRATION_HOST!;
  const port = Number(process.env.CLAMAV_INTEGRATION_PORT || 3310);
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port }); let response = '';
    const timeout = setTimeout(() => socket.destroy(new Error('ClamAV integration timeout')), 30_000);
    socket.once('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0'));
      const length = Buffer.alloc(4); length.writeUInt32BE(bytes.byteLength); socket.write(length); socket.write(bytes); socket.write(Buffer.alloc(4));
    });
    socket.on('data', (chunk) => { response += chunk.toString('utf8'); });
    socket.once('error', (error) => { clearTimeout(timeout); reject(error); });
    socket.once('end', () => { clearTimeout(timeout); resolve(parseClamdResponse(response)); });
  });
}

describeIntegration('ClamAV INSTREAM integration', () => {
  it('accepts clean content and rejects EICAR', async () => {
    expect((await scan(new TextEncoder().encode('clean capsicum scientific text'))).result).toBe('clean');
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    expect((await scan(new TextEncoder().encode(eicar))).result).toBe('infected');
  }, 60_000);
});
