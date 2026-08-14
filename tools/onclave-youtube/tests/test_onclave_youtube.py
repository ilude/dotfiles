"""Tests for the consolidated Onclave YouTube console command."""

from unittest.mock import patch

from onclave_youtube import main


def test_dispatches_ingest_arguments():
    with patch("onclave_youtube.ingest_main") as ingest:
        with patch.dict("onclave_youtube.COMMANDS", {"ingest": ingest}, clear=True):
            main(["ingest", "dQw4w9WgXcQ", "--wait"])

    ingest.assert_called_once_with(["dQw4w9WgXcQ", "--wait"])


def test_rejects_unknown_command():
    try:
        main(["local-fetch"])
    except SystemExit as error:
        assert error.code == 2
    else:
        raise AssertionError("expected argparse to reject an unknown command")
