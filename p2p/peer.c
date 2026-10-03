/* P2P peer: register/search/list/deregister over UDP, download over TCP */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <unistd.h>
#include <errno.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <sys/wait.h>
#include <sys/resource.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>

#include "pdu.h"

#define MAX_LOCAL  20
#define FILE_CHUNK 100		/* same packet cap as Lab 3 */

struct local {
	int		in_use;
	char		peer[NAME_LEN + 1];
	char		content[NAME_LEN + 1];
	char		filename[256];
	int		sd;		/* TCP listening socket */
	unsigned short	port;
};

static struct local contents[MAX_LOCAL];
static int udp_sd;
static char my_name[NAME_LEN + 1];
static struct in_addr my_ip;

static void reaper(int sig)
{
	int	status;
	(void)sig;
	while (wait3(&status, WNOHANG, (struct rusage *)0) > 0)
		;
}

static void set_timeout(int sec, int usec)
{
	struct timeval tv;
	tv.tv_sec = sec;
	tv.tv_usec = usec;
	setsockopt(udp_sd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
}

static int read_line(const char *prompt, char *buf, int buflen)
{
	printf("%s", prompt);
	fflush(stdout);
	if (fgets(buf, buflen, stdin) == NULL)
		return -1;
	buf[strcspn(buf, "\r\n")] = '\0';
	return 0;
}

static int read_name(const char *prompt, char *name)
{
	char	line[128];

	if (read_line(prompt, line, sizeof(line)) < 0)
		return -1;
	if (line[0] == '\0' || strlen(line) > NAME_LEN) {
		printf("Name must be 1 to %d characters\n", NAME_LEN);
		return -1;
	}
	strcpy(name, line);
	return 0;
}

static void put_name(char *dst, const char *src)
{
	memset(dst, 0, NAME_LEN);
	memcpy(dst, src, strlen(src));
}

static void get_name(char *dst, const char *src)
{
	memcpy(dst, src, NAME_LEN);
	dst[NAME_LEN] = '\0';
}

/* UDP request/response. Returns bytes received, or -1. */
static int udp_roundtrip(const char *pdu, int plen, char *reply, int replymax)
{
	int	n;

	if (send(udp_sd, pdu, plen, 0) != plen) {
		fprintf(stderr, "Index send failed\n");
		return -1;
	}
	n = recv(udp_sd, reply, replymax, 0);
	if (n < 1) {
		fprintf(stderr, "No reply from index server\n");
		return -1;
	}
	return n;
}

static int open_listen(unsigned short *port)
{
	int	sd;
	struct	sockaddr_in addr;
	socklen_t alen;

	if ((sd = socket(AF_INET, SOCK_STREAM, 0)) == -1) {
		fprintf(stderr, "Can't creat a socket\n");
		return -1;
	}
	bzero((char *)&addr, sizeof(addr));
	addr.sin_family = AF_INET;
	addr.sin_port = htons(0);		/* OS picks the port */
	addr.sin_addr.s_addr = htonl(INADDR_ANY);
	if (bind(sd, (struct sockaddr *)&addr, sizeof(addr)) == -1) {
		fprintf(stderr, "Can't bind name to socket\n");
		close(sd);
		return -1;
	}
	if (listen(sd, 5) == -1) {
		fprintf(stderr, "Listen failed\n");
		close(sd);
		return -1;
	}
	alen = sizeof(addr);
	if (getsockname(sd, (struct sockaddr *)&addr, &alen) == -1) {
		fprintf(stderr, "getsockname failed\n");
		close(sd);
		return -1;
	}
	*port = ntohs(addr.sin_port);
	return sd;
}

/*
 * Content registration.
 * Sends R and waits for A, or E if this peer name already registered
 * the same content. On E the user may pick another peer name.
 */
static int register_content(const char *content, const char *filename, int sd, unsigned short port)
{
	char	pdu[1 + NAME_LEN + NAME_LEN + ADDR_LEN];
	char	reply[1 + MAX_DATA + 1];
	char	newname[NAME_LEN + 1];
	unsigned short netport;
	int	n, slot, i;

	for (i = 0; i < MAX_LOCAL; i++) {
		if (contents[i].in_use &&
		    strcmp(contents[i].content, content) == 0 &&
		    strcmp(contents[i].peer, my_name) == 0) {
			printf("Already registered '%s'\n", content);
			return -1;
		}
	}
	slot = -1;
	for (i = 0; i < MAX_LOCAL; i++) {
		if (!contents[i].in_use) {
			slot = i;
			break;
		}
	}
	if (slot < 0) {
		printf("Too many local contents\n");
		return -1;
	}

	for (;;) {
		pdu[0] = PDU_REG;
		put_name(pdu + 1, my_name);
		put_name(pdu + 1 + NAME_LEN, content);
		memcpy(pdu + 1 + NAME_LEN + NAME_LEN, &my_ip.s_addr, 4);
		netport = htons(port);
		memcpy(pdu + 1 + NAME_LEN + NAME_LEN + 4, &netport, 2);

		n = udp_roundtrip(pdu, sizeof(pdu), reply, MAX_DATA + 1);
		if (n < 0)
			return -1;
		reply[n] = '\0';
		if (reply[0] == PDU_ACK)
			break;
		if (reply[0] == PDU_ERR) {
			char	line[128];

			printf("%s", reply + 1);
			if (read_line("New peer name (blank to cancel): ",
					line, sizeof(line)) < 0 || line[0] == '\0') {
				printf("Registration cancelled\n");
				return -1;
			}
			if (strlen(line) > NAME_LEN) {
				printf("Name must be 1 to %d characters\n", NAME_LEN);
				printf("Registration cancelled\n");
				return -1;
			}
			strcpy(newname, line);
			strcpy(my_name, newname);
			continue;
		}
		printf("Unexpected reply from index\n");
		return -1;
	}

	contents[slot].in_use = 1;
	strcpy(contents[slot].peer, my_name);
	strcpy(contents[slot].content, content);
	strncpy(contents[slot].filename, filename, sizeof(contents[slot].filename) - 1);
	contents[slot].filename[sizeof(contents[slot].filename) - 1] = '\0';
	contents[slot].sd = sd;
	contents[slot].port = port;
	printf("Registered '%s' as '%s' at %s:%u\n",
		content, my_name, inet_ntoa(my_ip), port);
	return 0;
}

/* Send the file on an accepted TCP connection, then close it. */
static void serve_download(int sd, const char *filename, const char *expect)
{
	char	req[1 + NAME_LEN + NAME_LEN];
	char	buf[FILE_CHUNK + 1];
	char	got_content[NAME_LEN + 1];
	int	n, got;
	FILE	*fp;

	got = 0;
	while (got < (int)sizeof(req)) {
		n = read(sd, req + got, sizeof(req) - got);
		if (n <= 0) {
			close(sd);
			return;
		}
		got += n;
	}
	if (req[0] != PDU_DOWNLOAD) {
		buf[0] = PDU_ERR;
		strcpy(buf + 1, "Expected download request\n");
		write(sd, buf, 1 + strlen(buf + 1));
		close(sd);
		return;
	}
	get_name(got_content, req + 1 + NAME_LEN);
	if (strcmp(got_content, expect) != 0) {
		buf[0] = PDU_ERR;
		strcpy(buf + 1, "Content not available\n");
		write(sd, buf, 1 + strlen(buf + 1));
		close(sd);
		return;
	}

	fp = fopen(filename, "rb");
	if (fp == NULL) {
		buf[0] = PDU_ERR;
		strcpy(buf + 1, "Can't open file\n");
		write(sd, buf, 1 + strlen(buf + 1));
		close(sd);
		return;
	}

	/*
	 * C-type PDU. TCP is a byte stream, so the type byte is sent once
	 * and the rest of the bytes are file data (Lab 3). The server stops
	 * when the file has been written and closes the socket; that close
	 * is the client's end-of-transmission.
	 */
	buf[0] = PDU_CONTENT;
	n = fread(buf + 1, 1, FILE_CHUNK, fp);
	write(sd, buf, n + 1);
	while ((n = fread(buf, 1, FILE_CHUNK, fp)) > 0)
		write(sd, buf, n);
	fclose(fp);
	close(sd);
}

/* Content download: search, TCP transfer, then register as a server. */
static void download_content(void)
{
	char	content[NAME_LEN + 1];
	char	server_name[NAME_LEN + 1];
	char	pdu[1 + NAME_LEN + NAME_LEN];
	char	reply[1 + MAX_DATA + 1];
	char	buf[FILE_CHUNK + 1];
	struct	sockaddr_in server;
	struct	in_addr addr;
	unsigned short netport, port;
	int	n, sd, i, total, lsd;
	FILE	*fp;

	if (read_name("Content name: ", content) < 0)
		return;

	pdu[0] = PDU_SEARCH;
	put_name(pdu + 1, my_name);
	put_name(pdu + 1 + NAME_LEN, content);
	n = udp_roundtrip(pdu, sizeof(pdu), reply, MAX_DATA + 1);
	if (n < 0)
		return;
	reply[n] = '\0';
	if (reply[0] == PDU_ERR) {
		printf("%s", reply + 1);
		return;
	}
	if (reply[0] != PDU_SEARCH || n < 1 + NAME_LEN + ADDR_LEN) {
		printf("Unexpected search reply\n");
		return;
	}
	get_name(server_name, reply + 1);
	memcpy(&addr.s_addr, reply + 1 + NAME_LEN, 4);
	memcpy(&netport, reply + 1 + NAME_LEN + 4, 2);
	port = ntohs(netport);
	printf("Content server: %s at %s:%u\n",
		server_name, inet_ntoa(addr), port);

	if ((sd = socket(AF_INET, SOCK_STREAM, 0)) == -1) {
		fprintf(stderr, "Can't creat a socket\n");
		return;
	}
	bzero((char *)&server, sizeof(server));
	server.sin_family = AF_INET;
	server.sin_port = htons(port);
	server.sin_addr = addr;
	if (connect(sd, (struct sockaddr *)&server, sizeof(server)) == -1) {
		fprintf(stderr, "Can't connect\n");
		close(sd);
		return;
	}

	pdu[0] = PDU_DOWNLOAD;
	put_name(pdu + 1, my_name);
	put_name(pdu + 1 + NAME_LEN, content);
	write(sd, pdu, sizeof(pdu));

	n = read(sd, buf, FILE_CHUNK + 1);
	if (n <= 0) {
		fprintf(stderr, "No response from content server\n");
		close(sd);
		return;
	}
	if (buf[0] == PDU_ERR) {
		if (n > 1)
			write(1, buf + 1, n - 1);
		while ((i = read(sd, buf, FILE_CHUNK)) > 0)
			write(1, buf, i);
		close(sd);
		return;
	}
	if (buf[0] != PDU_CONTENT) {
		fprintf(stderr, "Unexpected response from content server\n");
		close(sd);
		return;
	}

	fp = fopen(content, "wb");
	if (fp == NULL) {
		fprintf(stderr, "Can't create local file: %s\n", content);
		close(sd);
		return;
	}
	total = 0;
	if (n > 1) {
		fwrite(buf + 1, 1, n - 1, fp);
		total += n - 1;
	}
	/* read until the content server closes the connection */
	while ((i = read(sd, buf, FILE_CHUNK)) > 0) {
		fwrite(buf, 1, i, fp);
		total += i;
	}
	fclose(fp);
	close(sd);
	printf("Saved '%s' (%d bytes)\n", content, total);

	/* become a content server of the file just downloaded */
	lsd = open_listen(&port);
	if (lsd < 0)
		return;
	if (register_content(content, content, lsd, port) < 0)
		close(lsd);
}

static void list_content(void)
{
	char	pdu[1];
	char	reply[1 + MAX_DATA + 1];
	int	n, any;

	pdu[0] = PDU_LIST;
	if (send(udp_sd, pdu, 1, 0) != 1) {
		fprintf(stderr, "Index send failed\n");
		return;
	}
	printf("Registered content:\n");
	any = 0;
	set_timeout(0, 400000);
	while ((n = recv(udp_sd, reply, MAX_DATA + 1, 0)) > 0) {
		if (reply[0] != PDU_LIST)
			break;
		write(1, reply + 1, n - 1);
		any = 1;
	}
	set_timeout(2, 0);
	if (!any)
		printf("(no reply)\n");
}

/* Content deregistration of one locally registered content. */
static void deregister_content(void)
{
	char	content[NAME_LEN + 1];
	char	pdu[1 + NAME_LEN + NAME_LEN];
	char	reply[1 + MAX_DATA + 1];
	int	i, n;

	if (read_name("Content name: ", content) < 0)
		return;
	for (i = 0; i < MAX_LOCAL; i++) {
		if (!contents[i].in_use)
			continue;
		if (strcmp(contents[i].content, content) != 0)
			continue;
		if (strcmp(contents[i].peer, my_name) != 0)
			continue;

		pdu[0] = PDU_DEREG;
		put_name(pdu + 1, contents[i].peer);
		put_name(pdu + 1 + NAME_LEN, contents[i].content);
		n = udp_roundtrip(pdu, sizeof(pdu), reply, MAX_DATA + 1);
		if (n < 0)
			return;
		reply[n] = '\0';
		if (reply[0] == PDU_ERR) {
			printf("%s", reply + 1);
			return;
		}
		if (reply[0] != PDU_ACK) {
			printf("Unexpected reply from index\n");
			return;
		}
		close(contents[i].sd);
		contents[i].in_use = 0;
		printf("Deregistered '%s'\n", content);
		return;
	}
	printf("You have not registered '%s'\n", content);
}

/* Quit: deregister every content this peer registered, then exit. */
static void quit_peer(void)
{
	char	pdu[1 + NAME_LEN + NAME_LEN];
	char	reply[1 + MAX_DATA + 1];
	int	i, n;

	for (i = 0; i < MAX_LOCAL; i++) {
		if (!contents[i].in_use)
			continue;
		pdu[0] = PDU_DEREG;
		put_name(pdu + 1, contents[i].peer);
		put_name(pdu + 1 + NAME_LEN, contents[i].content);
		n = udp_roundtrip(pdu, sizeof(pdu), reply, MAX_DATA + 1);
		if (n > 0 && reply[0] == PDU_ACK)
			printf("Deregistered '%s'\n", contents[i].content);
		else
			printf("Could not deregister '%s'\n", contents[i].content);
		close(contents[i].sd);
		contents[i].in_use = 0;
	}
	close(udp_sd);
	exit(0);
}

static void do_register_cmd(void)
{
	char	content[NAME_LEN + 1];
	char	filename[256];
	unsigned short port;
	int	sd;
	FILE	*fp;

	if (read_name("Content name: ", content) < 0)
		return;
	if (read_line("File name: ", filename, sizeof(filename)) < 0)
		return;
	if (filename[0] == '\0') {
		printf("File name required\n");
		return;
	}
	fp = fopen(filename, "rb");
	if (fp == NULL) {
		printf("Can't open file\n");
		return;
	}
	fclose(fp);

	sd = open_listen(&port);
	if (sd < 0)
		return;
	if (register_content(content, filename, sd, port) < 0)
		close(sd);
}

static void print_help(void)
{
	printf("Commands:\n");
	printf("  r  register a local file as content\n");
	printf("  d  search, download, and register the content\n");
	printf("  l  list content registered at the index\n");
	printf("  t  deregister one content\n");
	printf("  q  deregister everything and quit\n");
}

int main(int argc, char **argv)
{
	int	port, nready;
	char	*host;
	struct	hostent *hp;
	struct	sockaddr_in index_addr, local, client;
	socklen_t alen;
	fd_set	afds, rfds;
	int	i;

	switch (argc) {
	case 2:
		host = argv[1];
		port = SERVER_UDP_PORT;
		break;
	case 3:
		host = argv[1];
		port = atoi(argv[2]);
		break;
	default:
		fprintf(stderr, "Usage: %s index-host [index-port]\n", argv[0]);
		exit(1);
	}

	setvbuf(stdout, NULL, _IOLBF, 0);
	if (read_name("Enter peer name: ", my_name) < 0)
		exit(1);

	if ((udp_sd = socket(AF_INET, SOCK_DGRAM, 0)) == -1) {
		fprintf(stderr, "Can't creat a socket\n");
		exit(1);
	}
	bzero((char *)&index_addr, sizeof(index_addr));
	index_addr.sin_family = AF_INET;
	index_addr.sin_port = htons(port);
	if ((hp = gethostbyname(host)) != NULL)
		bcopy(hp->h_addr, (char *)&index_addr.sin_addr, hp->h_length);
	else if (!inet_aton(host, &index_addr.sin_addr)) {
		fprintf(stderr, "Can't get server's address\n");
		exit(1);
	}
	/* connect so getsockname tells us the local IP we should advertise */
	if (connect(udp_sd, (struct sockaddr *)&index_addr, sizeof(index_addr)) == -1) {
		fprintf(stderr, "Can't connect to index\n");
		exit(1);
	}
	alen = sizeof(local);
	if (getsockname(udp_sd, (struct sockaddr *)&local, &alen) == -1) {
		fprintf(stderr, "getsockname failed\n");
		exit(1);
	}
	my_ip = local.sin_addr;
	set_timeout(2, 0);

	(void)signal(SIGCHLD, reaper);
	printf("Peer '%s' at %s. Index %s:%d\n",
		my_name, inet_ntoa(my_ip), host, port);
	print_help();

	for (;;) {
		FD_ZERO(&afds);
		FD_SET(0, &afds);			/* stdin */
		for (i = 0; i < MAX_LOCAL; i++) {
			if (contents[i].in_use)
				FD_SET(contents[i].sd, &afds);
		}
		memcpy(&rfds, &afds, sizeof(rfds));
		printf("> ");
		fflush(stdout);
		nready = select(FD_SETSIZE, &rfds, NULL, NULL, NULL);
		if (nready < 0) {
			if (errno == EINTR)
				continue;
			perror("select");
			exit(1);
		}

		/* pending download on one of our content sockets */
		for (i = 0; i < MAX_LOCAL; i++) {
			int	new_sd;
			if (!contents[i].in_use)
				continue;
			if (!FD_ISSET(contents[i].sd, &rfds))
				continue;
			alen = sizeof(client);
			new_sd = accept(contents[i].sd,
				(struct sockaddr *)&client, &alen);
			if (new_sd < 0)
				continue;
			switch (fork()) {
			case 0:
				serve_download(new_sd, contents[i].filename,
					contents[i].content);
				exit(0);
			case -1:
				fprintf(stderr, "fork: error\n");
				close(new_sd);
				break;
			default:
				close(new_sd);
				break;
			}
		}

		if (FD_ISSET(0, &rfds)) {
			char	line[128];
			if (fgets(line, sizeof(line), stdin) == NULL)
				quit_peer();
			switch (line[0]) {
			case 'r':
			case 'R':
				do_register_cmd();
				break;
			case 'd':
			case 'D':
				download_content();
				break;
			case 'l':
			case 'L':
				list_content();
				break;
			case 't':
			case 'T':
				deregister_content();
				break;
			case 'q':
			case 'Q':
				quit_peer();
				break;
			case '\n':
				break;
			default:
				print_help();
				break;
			}
		}
	}
}
