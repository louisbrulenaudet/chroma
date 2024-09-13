import pytest
from chromadb.api import ClientAPI


def test_update_query_with_none_data(client: ClientAPI) -> None:
    client.reset()
    collection = client.create_collection("test_update_query")

    invalid_updated_records = {
        "ids": ["1", "2"],
        "embeddings": None,
        "documents": None,
        "metadatas": None,
    }

    with pytest.raises(ValueError) as e:
        collection.update(**invalid_updated_records)  # type: ignore[arg-type]

    assert e.match(
        "You must provide one of embeddings, documents, images, uris, metadatas"
    )
