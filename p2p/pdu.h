/*
 * COE768 P2P PDU layout
 *
 * Every PDU is:  1 byte type | data
 * Data is at most 100 bytes, except C (content), which is the file itself.
 *
 *   R  register          peer[10] content[10] ipv4[4] port[2]
 *   S  search request    peer[10] content[10]
 *   S  search response   server_peer[10] ipv4[4] port[2]
 *   T  deregister        peer[10] content[10]
 *   D  download request  peer[10] content[10]          (TCP)
 *   C  content data      type byte, then file bytes    (TCP, until close)
 *   O  list request      (no data)
 *   O  list response     text, up to 100 bytes per datagram
 *   A  acknowledgement   peer[10]
 *   E  error             message string
 *
 * Names are fixed 10-byte fields, null-padded. The port is network byte order.
 * ipv4 is the 4-byte address in network byte order.
 */
#ifndef PDU_H
#define PDU_H

#define SERVER_UDP_PORT 3000
#define NAME_LEN        10
#define MAX_DATA        100
#define ADDR_LEN        6	/* 4-byte IPv4 + 2-byte port */

#define PDU_REG      'R'
#define PDU_DOWNLOAD 'D'
#define PDU_SEARCH   'S'
#define PDU_DEREG    'T'
#define PDU_CONTENT  'C'
#define PDU_LIST     'O'
#define PDU_ACK      'A'
#define PDU_ERR      'E'

#endif
