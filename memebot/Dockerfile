# Paper-trading memebot. No third-party dependencies.
FROM python:3.12-slim

WORKDIR /app
COPY memebot ./memebot
COPY config.example.json ./

# Run as a non-root user; state and logs go to the /app/data volume.
RUN useradd --create-home bot && mkdir -p /app/data && chown bot /app/data
USER bot
VOLUME ["/app/data"]
EXPOSE 8050

ENV PYTHONUNBUFFERED=1
# Live market data, paper fills, web dashboard on port 8050. Inside a
# container the dashboard must bind 0.0.0.0; publish it only to localhost
# (docker run -p 127.0.0.1:8050:8050 ...) unless it sits behind auth.
ENTRYPOINT ["python", "-m", "memebot"]
CMD ["run", "--source", "dexscreener", "--web", "8050", "--host", "0.0.0.0"]
