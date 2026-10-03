/* P2P index server (UDP): register, search, list, deregister */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#include "pdu.h"

#define MAX_ENTRIES 100

struct entry {
	int	valid;
	int	used;			/* times this server was handed out */
	char	peer[NAME_LEN + 1];
	char	content[NAME_LEN + 1];
	struct	in_addr addr;
	unsigned short port;		/* host order */
};

static struct entry table[MAX_ENTRIES];

static void name_from(char *dst, const char *src)
{
	memcpy(dst, src, NAME_LEN);
	dst[NAME_LEN] = '\0';
}

static void send_err(int sd, struct sockaddr_in *to, socklen_t tolen, const char *msg)
{
	char	pdu[1 + MAX_DATA];
	int	len;

	pdu[0] = PDU_ERR;
	len = strlen(msg);
	if (len > MAX_DATA)
		len = MAX_DATA;
	memcpy(pdu + 1, msg, len);
	sendto(sd, pdu, 1 + len, 0, (struct sockaddr *)to, tolen);
}

static void send_ack(int sd, struct sockaddr_in *to, socklen_t tolen, const char *peer)
{
	char	pdu[1 + NAME_LEN];

	pdu[0] = PDU_ACK;
	memset(pdu + 1, 0, NAME_LEN);
	memcpy(pdu + 1, peer, strlen(peer));
	sendto(sd, pdu, 1 + NAME_LEN, 0, (struct sockaddr *)to, tolen);
}

/* R: reject a duplicate (peer, content); otherwise store the address */
static void do_register(int sd, char *data, int dlen,
			struct sockaddr_in *to, socklen_t tolen)
{
	char	peer[NAME_LEN + 1], content[NAME_LEN + 1];
	struct	in_addr addr;
	unsigned short netport, port;
	int	i, free_slot;

	if (dlen < NAME_LEN + NAME_LEN + ADDR_LEN) {
		send_err(sd, to, tolen, "Invalid registration PDU\n");
		return;
	}
	name_from(peer, data);
	name_from(content, data + NAME_LEN);
	if (peer[0] == '\0' || content[0] == '\0') {
		send_err(sd, to, tolen, "Empty peer or content name\n");
		return;
	}
	memcpy(&addr.s_addr, data + NAME_LEN + NAME_LEN, 4);
	memcpy(&netport, data + NAME_LEN + NAME_LEN + 4, 2);
	port = ntohs(netport);

	for (i = 0; i < MAX_ENTRIES; i++) {
		if (!table[i].valid)
			continue;
		if (strcmp(table[i].peer, peer) == 0 &&
		    strcmp(table[i].content, content) == 0) {
			send_err(sd, to, tolen,
				"Peer name already used for this content\n");
			return;
		}
	}

	free_slot = -1;
	for (i = 0; i < MAX_ENTRIES; i++) {
		if (!table[i].valid) {
			free_slot = i;
			break;
		}
	}
	if (free_slot < 0) {
		send_err(sd, to, tolen, "Index is full\n");
		return;
	}

	table[free_slot].valid = 1;
	table[free_slot].used = 0;
	strcpy(table[free_slot].peer, peer);
	strcpy(table[free_slot].content, content);
	table[free_slot].addr = addr;
	table[free_slot].port = port;
	printf("Registered '%s' content '%s' at %s:%u\n",
		peer, content, inet_ntoa(addr), port);
	fflush(stdout);
	send_ack(sd, to, tolen, peer);
}

/*
 * S: reply with the content server that has been used the least.
 * Handing out the address counts as a use, so the next search
 * prefers a different server.
 */
static void do_search(int sd, char *data, int dlen,
		       struct sockaddr_in *to, socklen_t tolen)
{
	char	peer[NAME_LEN + 1], content[NAME_LEN + 1];
	char	pdu[1 + NAME_LEN + ADDR_LEN];
	unsigned short netport;
	int	i, best;

	if (dlen < NAME_LEN + NAME_LEN) {
		send_err(sd, to, tolen, "Invalid search PDU\n");
		return;
	}
	name_from(peer, data);
	name_from(content, data + NAME_LEN);

	best = -1;
	for (i = 0; i < MAX_ENTRIES; i++) {
		if (!table[i].valid)
			continue;
		if (strcmp(table[i].content, content) != 0)
			continue;
		if (best < 0 || table[i].used < table[best].used)
			best = i;
	}
	if (best < 0) {
		send_err(sd, to, tolen, "Content not found\n");
		printf("Search '%s' by '%s' -> not found\n", content, peer);
		fflush(stdout);
		return;
	}

	table[best].used++;
	printf("Search '%s' by '%s' -> %s %s:%u (used %d)\n",
		content, peer, table[best].peer,
		inet_ntoa(table[best].addr), table[best].port,
		table[best].used);
	fflush(stdout);

	pdu[0] = PDU_SEARCH;
	memset(pdu + 1, 0, NAME_LEN);
	memcpy(pdu + 1, table[best].peer, strlen(table[best].peer));
	memcpy(pdu + 1 + NAME_LEN, &table[best].addr.s_addr, 4);
	netport = htons(table[best].port);
	memcpy(pdu + 1 + NAME_LEN + 4, &netport, 2);
	sendto(sd, pdu, 1 + NAME_LEN + ADDR_LEN, 0,
		(struct sockaddr *)to, tolen);
}

/* T: drop one (peer, content) registration */
static void do_deregister(int sd, char *data, int dlen,
			   struct sockaddr_in *to, socklen_t tolen)
{
	char	peer[NAME_LEN + 1], content[NAME_LEN + 1];
	int	i;

	if (dlen < NAME_LEN + NAME_LEN) {
		send_err(sd, to, tolen, "Invalid deregistration PDU\n");
		return;
	}
	name_from(peer, data);
	name_from(content, data + NAME_LEN);

	for (i = 0; i < MAX_ENTRIES; i++) {
		if (!table[i].valid)
			continue;
		if (strcmp(table[i].peer, peer) == 0 &&
		    strcmp(table[i].content, content) == 0) {
			table[i].valid = 0;
			printf("Deregistered '%s' content '%s'\n", peer, content);
			fflush(stdout);
			send_ack(sd, to, tolen, peer);
			return;
		}
	}
	send_err(sd, to, tolen, "Content not registered\n");
}

/* O: one or more datagrams, each carrying at most 100 bytes of text */
static void do_list(int sd, struct sockaddr_in *to, socklen_t tolen)
{
	char	text[MAX_ENTRIES * 24];
	char	pdu[1 + MAX_DATA];
	int	len, off, i, chunk;

	len = 0;
	for (i = 0; i < MAX_ENTRIES; i++) {
		if (!table[i].valid)
			continue;
		len += sprintf(text + len, "%-10s %-10s\n",
			table[i].peer, table[i].content);
	}
	if (len == 0) {
		pdu[0] = PDU_LIST;
		strcpy(pdu + 1, "(none)\n");
		sendto(sd, pdu, 1 + strlen(pdu + 1), 0,
			(struct sockaddr *)to, tolen);
		return;
	}
	off = 0;
	while (off < len) {
		chunk = len - off;
		if (chunk > MAX_DATA)
			chunk = MAX_DATA;
		/* keep lines intact when the cut lands past a newline */
		if (off + chunk < len) {
			int	k;
			for (k = chunk - 1; k > 0; k--) {
				if (text[off + k] == '\n') {
					chunk = k + 1;
					break;
				}
			}
		}
		pdu[0] = PDU_LIST;
		memcpy(pdu + 1, text + off, chunk);
		sendto(sd, pdu, 1 + chunk, 0, (struct sockaddr *)to, tolen);
		off += chunk;
	}
}

int main(int argc, char **argv)
{
	int	sd, port, n;
	struct	sockaddr_in server, client;
	socklen_t client_len;
	char	buf[1 + MAX_DATA];

	switch (argc) {
	case 1:
		port = SERVER_UDP_PORT;
		break;
	case 2:
		port = atoi(argv[1]);
		break;
	default:
		fprintf(stderr, "Usage: %s [port]\n", argv[0]);
		exit(1);
	}

	if ((sd = socket(AF_INET, SOCK_DGRAM, 0)) == -1) {
		fprintf(stderr, "Can't creat a socket\n");
		exit(1);
	}

	bzero((char *)&server, sizeof(server));
	server.sin_family = AF_INET;
	server.sin_port = htons(port);
	server.sin_addr.s_addr = htonl(INADDR_ANY);
	if (bind(sd, (struct sockaddr *)&server, sizeof(server)) == -1) {
		fprintf(stderr, "Can't bind name to socket\n");
		exit(1);
	}

	printf("Index server listening on UDP port %d\n", port);
	fflush(stdout);

	while (1) {
		client_len = sizeof(client);
		n = recvfrom(sd, buf, sizeof(buf), 0,
			(struct sockaddr *)&client, &client_len);
		if (n < 1)
			continue;
		switch (buf[0]) {
		case PDU_REG:
			do_register(sd, buf + 1, n - 1, &client, client_len);
			break;
		case PDU_SEARCH:
			do_search(sd, buf + 1, n - 1, &client, client_len);
			break;
		case PDU_DEREG:
			do_deregister(sd, buf + 1, n - 1, &client, client_len);
			break;
		case PDU_LIST:
			do_list(sd, &client, client_len);
			break;
		default:
			send_err(sd, &client, client_len, "Unknown PDU type\n");
			break;
		}
	}
}
