HOST ?= localhost
PORT ?= 4100
LOG_FILE = /tmp/jekyll$(PORT).log

SHELL = /bin/bash -c
.SHELLFLAGS = -e

default: serve

# Bundle install (dependency for jekyll-serve)
bundle-install:
	@if [ ! -f .bundle/install_marker ] || [ Gemfile -nt .bundle/install_marker ] || [ Gemfile.lock -nt .bundle/install_marker ]; then \
		bundle install; \
		mkdir -p .bundle && touch .bundle/install_marker; \
	fi

# Start Jekyll server in the background and wait until it is ready
serve: bundle-install frontend-stop
	@bundle exec jekyll serve -H $(HOST) -P $(PORT) > $(LOG_FILE) 2>&1 &
	@make wait-for-server

wait-for-server:
	@until [ -f $(LOG_FILE) ]; do sleep 1; done
	@for ((COUNTER = 0; ; COUNTER++)); do \
		if grep -q "Server address:" $(LOG_FILE); then \
			echo "Server started in $$COUNTER seconds"; \
			grep "Server address:" $(LOG_FILE); \
			break; \
		fi; \
		if [ $$COUNTER -eq 60 ]; then \
			echo "Server timed out after $$COUNTER seconds."; \
			echo "Review errors from $(LOG_FILE)."; \
			cat $(LOG_FILE); \
			exit 1; \
		fi; \
		if grep -E -qi "\bfatal\b|\bexception\b" $(LOG_FILE); then \
			echo "Fatal error detected during startup!"; \
			cat $(LOG_FILE); \
			exit 1; \
		fi; \
		sleep 1; \
	done

# Build the static site into _site/ for deployment (no server)
build: bundle-install
	@bundle exec jekyll build

frontend-stop:
	@echo "Stopping server..."
	@lsof -ti :$(PORT) | xargs kill >/dev/null 2>&1 || true
	@rm -f $(LOG_FILE)

stop: frontend-stop

reload: frontend-stop serve

clean: stop
	@rm -rf _site .jekyll-cache

.PHONY: frontend-stop default bundle-install serve wait-for-server build stop reload clean
