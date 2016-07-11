const hyperdrive = require('hyperdrive')
const memdb = require('memdb')
const http = require('stream-http')
const crypto = require('crypto')
const swarm = require('hyperdrive-archive-swarm')
const signalhub = require('signalhub')
const normalize = require('normalize-url')
const toBlobURL = require('stream-to-blob-url')
const path = require('path')

var hub = signalhub(`peerdownload-${signature(window.location.href)}`, ['https://signalhub.mafintosh.com'])
var drive = hyperdrive(memdb())

var fileHashes = {}

var channel = signature(window.location.href)
var sub = hub.subscribe(channel)
sub.on('data', (msg) => {
  if (msg.type === 'fetch') {
    if (Object.keys(fileHashes).length > 0) {
      hub.broadcast(channel, {type: 'hash', hashes: fileHashes})
    }
  } else if (msg.type === 'hash') {
    Object.keys(msg.hashes).forEach((url) => {
      fileHashes[url] = msg.hashes[url]
    })
  }
})
hub.broadcast(channel, {type: 'fetch'})

document.addEventListener('DOMContentLoaded', hook)

function hook () {
  document.querySelectorAll('[peerdownload]').forEach((dom) => {
    dom.addEventListener('click', (e) => {
      e.preventDefault()

      download(dom.href)
    })
  })
}

function download (fileURL) {
  if (fileHashes[signature(fileURL)]) {
    // if it's a known file in fileHashes, use peerdownload
    var archive = drive.createArchive(fileHashes[signature(fileURL)])
    swarm(archive)
    downloadArchiveFile(archive, fileURL, () => { console.log('done') })
  } else {
    var archive = drive.createArchive()
    var ws = archive.createFileWriteStream('data')
    http.get(fileURL, (res) => {
      res.pipe(ws).on('finish', () => {
        archive.finalize(() => {
          swarm(archive)
          downloadArchiveFile(archive, fileURL, () => {
            fileHashes[signature(fileURL)] = archive.key.toString('hex')
            hub.broadcast(channel, {type: 'hash', hashes: fileHashes})
          })
        })
      })
    })
  }
}

function signature (url) {
  return crypto.createHash('sha256').update(normalize(url)).digest('hex')
}

function saveBlobURL (fileURL, blobURL) {
  var a = document.createElement('a')
  document.body.appendChild(a)
  a.style = "display: none"
  a.href = blobURL
  a.download = path.basename(fileURL)
  a.click()
}

function downloadArchiveFile(archive, fileURL, cb) {
  var rs = archive.createFileReadStream('data')
  toBlobURL(rs, (err, blobURL) => {
    if (err) {
      return cb(err)
    }

    saveBlobURL(fileURL, blobURL)
    cb()
  })
}
