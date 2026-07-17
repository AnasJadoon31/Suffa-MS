async def test_non_blog_manager_cannot_list_drafts(client, teacher_client):
    draft = await client.post(
        "/api/v1/operations/blog",
        json={"title": "Private draft", "body": "Not published"},
    )
    published = await client.post(
        "/api/v1/operations/blog",
        json={"title": "Public post", "body": "Published", "published": True},
    )
    assert draft.status_code == 200
    assert published.status_code == 200

    response = await teacher_client.get("/api/v1/operations/blog")

    assert response.status_code == 200
    assert [post["title"] for post in response.json()] == ["Public post"]


async def test_admission_form_can_be_deleted_when_it_has_no_responses(client, seed):
    created = await client.post(
        "/api/v1/operations/admission-forms",
        json={"program_id": str(seed.program.id), "title": "Delete me"},
    )

    response = await client.delete(
        f"/api/v1/operations/admission-forms/{created.json()['id']}"
    )

    assert response.status_code == 200
    assert response.json() == {"status": "deleted"}


async def test_admission_form_with_applications_must_be_closed_not_deleted(client, seed):
    created = await client.post(
        "/api/v1/operations/admission-forms",
        json={"program_id": str(seed.program.id), "title": "Active form"},
    )
    token = created.json()["public_token"]
    submitted = await client.post(
        f"/api/v1/public/admission-forms/{token}",
        json={"applicant_name": "Applicant", "guardian_contact": "+92000000000"},
    )
    assert submitted.status_code == 200

    response = await client.delete(
        f"/api/v1/operations/admission-forms/{created.json()['id']}"
    )

    assert response.status_code == 409
    assert "close" in response.json()["detail"].lower()
