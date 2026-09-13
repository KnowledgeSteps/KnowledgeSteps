# Offline IP data

Source: https://github.com/lionsoul2014/ip2region/tree/master/data
Downloaded 2026-09-13. Distributed under the accompanying Apache-2.0 OR MIT license.

- ip2region_v4.xdb: SHA-256 `8e31bbdccb5bf21028af10592d4312ec975da0bffa108c0c5d862a12190f9ad3`
- ip2region_v6.xdb: SHA-256 `939f6b46bd2b8bec3cf7c5ceb8ba782266ae9b1f35b5ba7916700dec0b7506ed`

Java client: org.lionsoul:ip2region:3.3.7. Uses vector index caching, two searchers per IP version; no full database memory cache. Files are copied to a private temporary directory at startup and removed at normal shutdown. Raw visitor IPs are looked up locally, never sent to the data publisher. Databases are bundled, so production starts without network downloads. Updating data requires replacing both files, verifying hashes and running geolocation tests; do not silently auto-update in production.
