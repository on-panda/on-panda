const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rightRotate32(value, shift) {
    return (value >>> shift) | (value << (32 - shift))
}

export function sha256Uint8Array(message) {
    const paddedLength = Math.ceil((message.length + 9) / 64) * 64
    const padded = new Uint8Array(paddedLength)
    padded.set(message)
    padded[message.length] = 0x80

    const bitLengthHi = Math.floor(message.length / 0x20000000)
    const bitLengthLo = (message.length << 3) >>> 0
    padded[padded.length - 8] = (bitLengthHi >>> 24) & 0xff
    padded[padded.length - 7] = (bitLengthHi >>> 16) & 0xff
    padded[padded.length - 6] = (bitLengthHi >>> 8) & 0xff
    padded[padded.length - 5] = bitLengthHi & 0xff
    padded[padded.length - 4] = (bitLengthLo >>> 24) & 0xff
    padded[padded.length - 3] = (bitLengthLo >>> 16) & 0xff
    padded[padded.length - 2] = (bitLengthLo >>> 8) & 0xff
    padded[padded.length - 1] = bitLengthLo & 0xff

    const w = new Uint32Array(64)
    const hash = new Uint32Array([
        0x6a09e667,
        0xbb67ae85,
        0x3c6ef372,
        0xa54ff53a,
        0x510e527f,
        0x9b05688c,
        0x1f83d9ab,
        0x5be0cd19,
    ])

    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) {
            const wordOffset = offset + i * 4
            w[i] = (
                (padded[wordOffset] << 24) |
                (padded[wordOffset + 1] << 16) |
                (padded[wordOffset + 2] << 8) |
                padded[wordOffset + 3]
            ) >>> 0
        }

        for (let i = 16; i < 64; i++) {
            const s0 = rightRotate32(w[i - 15], 7) ^ rightRotate32(w[i - 15], 18) ^ (w[i - 15] >>> 3)
            const s1 = rightRotate32(w[i - 2], 17) ^ rightRotate32(w[i - 2], 19) ^ (w[i - 2] >>> 10)
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
        }

        let a = hash[0]
        let b = hash[1]
        let c = hash[2]
        let d = hash[3]
        let e = hash[4]
        let f = hash[5]
        let g = hash[6]
        let h = hash[7]

        for (let i = 0; i < 64; i++) {
            const s1 = rightRotate32(e, 6) ^ rightRotate32(e, 11) ^ rightRotate32(e, 25)
            const ch = (e & f) ^ (~e & g)
            const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0
            const s0 = rightRotate32(a, 2) ^ rightRotate32(a, 13) ^ rightRotate32(a, 22)
            const maj = (a & b) ^ (a & c) ^ (b & c)
            const temp2 = (s0 + maj) >>> 0

            h = g
            g = f
            f = e
            e = (d + temp1) >>> 0
            d = c
            c = b
            b = a
            a = (temp1 + temp2) >>> 0
        }

        hash[0] = (hash[0] + a) >>> 0
        hash[1] = (hash[1] + b) >>> 0
        hash[2] = (hash[2] + c) >>> 0
        hash[3] = (hash[3] + d) >>> 0
        hash[4] = (hash[4] + e) >>> 0
        hash[5] = (hash[5] + f) >>> 0
        hash[6] = (hash[6] + g) >>> 0
        hash[7] = (hash[7] + h) >>> 0
    }

    const output = new Uint8Array(32)
    for (let i = 0; i < hash.length; i++) {
        output[i * 4] = (hash[i] >>> 24) & 0xff
        output[i * 4 + 1] = (hash[i] >>> 16) & 0xff
        output[i * 4 + 2] = (hash[i] >>> 8) & 0xff
        output[i * 4 + 3] = hash[i] & 0xff
    }
    return output
}
