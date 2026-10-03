CC = gcc
CFLAGS = -Wall -Wextra

all: index_server peer

index_server: index_server.c pdu.h
	$(CC) $(CFLAGS) -o index_server index_server.c

peer: peer.c pdu.h
	$(CC) $(CFLAGS) -o peer peer.c

clean:
	rm -f index_server peer
