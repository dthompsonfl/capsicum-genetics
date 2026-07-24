FROM rocker/r-ver:4.5.1
WORKDIR /app
RUN useradd --system --uid 10001 capsicum
COPY worker.R ./
USER capsicum
CMD ["Rscript", "worker.R", "health"]
