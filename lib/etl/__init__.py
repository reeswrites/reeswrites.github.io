import warnings

# Suppress urllib3 OpenSSL deprecation warnings (applies under pytest too)
warnings.filterwarnings("ignore", module="urllib3")
